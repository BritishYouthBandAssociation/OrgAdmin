'use strict';

// Import modules
const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const { helpers } = require(global.__lib);

const validator = require('@byba/express-validator');
const WPOrderProcessor = require('../WPOrderProcessor');
const { checkAdmin } = require('../middleware');

const {
	helpers: {
		SortHelper
	}
} = require(global.__lib);

const router = express.Router();

router.get('/', checkAdmin, async (req, res, next) => {
	const [season, seasons] = await Promise.all([
		req.db.Season.getSeasonOrDefault(req.query.season),
		req.db.Season.getSeasons()
	]);

	if (!season) {
		return res.redirect(`/config/season?needsSeason=true&next=${req.originalUrl}`);
	}

	const memberships = (await req.db.Membership.getAll({ SeasonId: season.id })).sort((a, b) => SortHelper.stringProp('Name', a, b));

	const labels = await req.db.Label.findAll({
		where: { '$Memberships.SeasonId$': season.id },
		include: [req.db.Membership],
		order: [['Name', 'ASC']]
	});

	return res.render('membership/index.hbs', {
		title: `${season.Identifier} Membership`,
		seasons: seasons,
		season: season.id,
		membership: memberships,
		filters: labels
	});
});

router.get('/new', validator.query(Joi.object({
	type: Joi.string(),
	email: Joi.string()
		.email(),
	org: Joi.number()
})), async (req, res, next) => {
	const promises = [
		req.db.MembershipType.getActive(),
		req.db.Season.getCurrent(),
		req.db.Division.getActive()
	];

	if (req.query.org) {
		promises.push(req.db.Organisation.findByPk(req.query.org));
	}

	const [types, season, divisions, member] = await Promise.all(promises);

	if (!season) {
		return res.redirect(`/config/season?needsSeason=true&next=${req.originalUrl}`);
	}

	res.render('membership/add.hbs', {
		title: 'Add Membership',
		type: req.query.type ?? '',
		email: req.query.email ?? '',
		types,
		member,
		season,
		divisions
	});
});

router.post('/new/organisation', validator.body(Joi.object({
	type: Joi.string().required(),
	organisation: Joi.string().optional().allow('', null),
	notFound: Joi.string(),
	season: Joi.number().required(),
	// eslint-disable-next-line camelcase
	organisation_search: Joi.string().optional(),
	division: Joi.number().optional().allow('', null)
})), async (req, res, next) => {
	const [type, membership] = await Promise.all([
		req.db.MembershipType.findOne({
			where: {
				id: req.body.type
			}
		}),

		req.db.Membership.findOne({
			where: {
				SeasonId: req.body.season
			},
			include: [{
				model: req.db.OrganisationMembership,
				where: {
					OrganisationId: req.body.organisation
				},
				required: true
			}]
		})
	]);

	if (!type || !type.IsOrganisation) {
		return next();
	}

	if (req.body.notFound === 'true') {
		return res.redirect(`/organisation/new?membershipType=${req.body.type}&name=${req.body.organisation_search}`);
	}

	if (membership) {
		//band already has a membership!
		return res.redirect(`/membership/${membership.id}/`);
	}

	const orgMembership = {
		OrganisationId: req.body.organisation,
	};

	if (req.body.division && req.body.division !== '') {
		orgMembership.DivisionId = req.body.division;

		const events = await req.db.EventRegistration.findAll({
			include: [{
				model: req.db.Event,
				where: {
					Start: {
						[Op.gt]: new Date()
					}
				}
			}],
			where: {
				OrganisationId: req.body.organisation
			}
		});

		//update division on future events
		await Promise.all(events.map(e => {
			e.DivisionId = req.body.division;
			return e.save();
		}));
	}

	//create the membership
	const newMembership = await req.db.Membership.create({
		SeasonId: req.body.season,
		MembershipTypeId: req.body.type,
		OrganisationMembership: orgMembership
	}, {
		include: [req.db.OrganisationMembership]
	});

	//display it
	return res.redirect(`../${newMembership.id}`);
});

router.post('/new/individual', validator.body(Joi.object({
	email: Joi.string().email().required(),
	type: Joi.string().required(),
	season: Joi.number().required()
})), async (req, res, next) => {
	const [exists, type] = await Promise.all([
		req.db.User.findByEmail(req.body.email),
		req.db.MembershipType.findOne({
			where: {
				id: req.body.type
			}
		})
	]);

	if (!exists) {
		//if not a current user, make them create one first
		return res.redirect(`/user/new?email=${req.body.email}&membership=${type.id}`);
	}

	//do they already have a membership for this season?
	const membership = await req.db.Membership.findOne({
		where: {
			SeasonId: req.body.season,
		},
		include: [{
			model: req.db.IndividualMembership,
			where: {
				UserId: exists.id
			},
			required: true
		}]
	});

	if (membership) {
		return res.redirect(`/membership/${membership.id}/`);
	}

	//create the membership
	const newMembership = await req.db.Membership.create({
		SeasonId: req.body.season,
		MembershipTypeId: req.body.type,
		IndividualMembership: {
			UserId: exists.id
		}
	}, {
		include: [req.db.IndividualMembership]
	});

	//display it
	return res.redirect(`/membership/${newMembership.id}/`);
});

router.get('/import-prep', checkAdmin, async (req, res) => {
	const [mappings, config] = await Promise.all([req.db.MembershipType.count({
		where: {
			LinkedImportId: {
				[Op.ne]: null
			}
		}
	}), req.db.WooCommerceImportConfig.findOne()]);

	const noMapping = mappings === 0;

	res.render('membership/importer.hbs', {
		title: 'Import Membership',
		firstRun: true && !noMapping,
		noMapping,
		config: config ?? {}
	});
});

router.post('/import-prep', checkAdmin, validator.body(Joi.object({
	url: Joi.string(), //not .uri() in case someone puts e.g. byba.online instead of http://byba.online
	key: Joi.string(),
	secret: Joi.string()
})), async (req, res) => {
	let config = await req.db.WooCommerceImportConfig.findOne();
	const found = config != null;

	if (!found) {
		config = {};
	}

	config.Domain = req.body.url;
	config.Key = req.body.key;
	config.Secret = req.body.secret;

	if (found) {
		await config.save();
	} else {
		await req.db.WooCommerceImportConfig.create(config);
	}

	res.redirect('import');
});

router.get('/import', checkAdmin, async (req, res) => {
	const promises = [req.db.WooCommerceImportConfig.findOne(), req.db.MembershipType.getActive({
		LinkedImportId: {
			[Op.ne]: null
		}
	})];

	if (req.query.season){
		promises.push(req.db.Season.findOne({
			where: {
				id: req.query.season
			}
		}));
	} else {
		promises.push(req.db.Season.getCurrent());
	}

	const [config, membershipTypes, season] = await Promise.all(promises);

	if (!season) {
		return res.redirect('/config/season?needsSeason=true&next=/membership/import');
	}

	if (!config) {
		return res.redirect('import-prep');
	}

	const products = membershipTypes.map(m => {
		return {
			ExternalId: m.LinkedImportId,
			id: m.id,
			IsOrganisation: m.IsOrganisation
		};
	});

	const start = new Date(season.Start.setMinutes(-1));
	const end = new Date(season.End.setHours(24));

	let url = `${config.Domain}wp-json/wc/v3/orders?after=${start.toISOString()}&before=${end.toISOString()}&per_page=50`;
	if (products.length === 1) {
		url += `&product=${products[0].ExternalId}`;
	}

	let data = null;
	try {
		data = await fetch(url, {
			headers: {
				Authorization: 'Basic ' + Buffer.from(`${config.Key}:${config.Secret}`).toString('base64')
			}
		}).then(res => res.json());
	} catch {
		return res.status(500).send('');
	}


	const processor = new WPOrderProcessor(products, season, req.db);
	let memberships = [];

	for (const element of data){
		const res = await processor.process(element);
		memberships = memberships.concat(res);
	}

	res.render('membership/import-result.hbs', {
		title: 'Membership Import',
		memberships
	});
});

router.get('/:id', validator.params(Joi.object({
	id: Joi.number()
})), validator.query(Joi.object({
	saved: Joi.boolean()
})), async (req, res, next) => {
	const [membership, paymentTypes, divisions] = await Promise.all([
		req.db.Membership.findByPk(req.params.id, {
			include: [
				req.db.Label,
				req.db.MembershipType,
				req.db.Fee,
				req.db.Season,
				{
					model: req.db.IndividualMembership,
					include: [req.db.User]
				},
				{
					model: req.db.OrganisationMembership,
					include: [
						{
							model: req.db.Organisation,
							include: [req.db.OrganisationType]
						},
						req.db.Division
					]
				}
			]
		}),
		req.db.PaymentType.getActive(),
		req.db.Division.getActive()
	]);

	if (!membership) {
		return next();
	}

	if (!req.session.user.IsAdmin) {
		if (membership.MembershipType.IsOrganisation) {
			if (membership.Entity.id !== req.session.band?.id) {
				return res.redirect('/no-access');
			}
		} else if (membership.Entity.Email !== req.session.user.Email) {
			return res.redirect('/no-access');
		}
	}

	return res.render('membership/view.hbs', {
		title: `Membership ${membership.Number}`,
		membership: membership,
		entity: membership.Entity,
		paymentTypes: paymentTypes,
		divisions,
		saved: req.query.saved ?? false
	});
});

router.post('/:id/division', validator.params(Joi.object({
	id: Joi.number()
})), validator.body(Joi.object({
	division: Joi.number()
		.required()
})), async (req, res, next) => {
	const [membership, division] = await Promise.all([
		req.db.Membership.findByPk(req.params.id, {
			include: req.db.OrganisationMembership
		}),
		req.db.Division.findByPk(req.body.division)
	]);

	if (!membership || !division) {
		return next();
	}

	await membership.OrganisationMembership.setDivision(division);

	const events = await req.db.EventRegistration.findAll({
		include: [{
			model: req.db.Event,
			where: {
				Start: {
					[Op.gt]: new Date()
				}
			}
		}],
		where: {
			OrganisationId: membership.OrganisationMembership.OrganisationId
		}
	});

	//update division on future events
	await Promise.all(events.map(e => {
		e.DivisionId = req.body.division;
		return e.save();
	}));

	return res.redirect('./?saved=true');
});

module.exports = {
	root: '/membership/',
	router: router
};
