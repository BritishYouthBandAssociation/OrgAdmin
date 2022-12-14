'use strict';

// Import modules
const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');

const validator = require('@byba/express-validator');

const router = express.Router();

router.get('/', async (req, res, next) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	const season = await req.db.Season.findOne({
		where: {
			Start: {
				[Op.lte]: Date.now()
			},
			End: {
				[Op.gte]: Date.now()
			}
		}
	});

	if (!season) {
		return res.redirect(`/config/season?needsSeason=true&next=${req.originalUrl}`);
	}

	const memberships = await req.db.Membership.findAll({
		where: { SeasonId: season.id },
		include: [
			req.db.Label,
			req.db.MembershipType,
			{
				model: req.db.IndividualMembership,
				include: [req.db.User]
			},
			{
				model: req.db.OrganisationMembership,
				include: [req.db.Organisation]
			}
		]
	});

	const labels = await req.db.Label.findAll({
		where: { '$Memberships.SeasonId$': season.id },
		include: [req.db.Membership],
		order: [['Name', 'ASC']]
	});

	return res.render('membership/index.hbs', {
		title: `${season.Identifier} Membership`,
		seasons: [season.id],
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
		req.db.MembershipType.findAll({
			where: {
				IsActive: true
			}
		}),
		req.db.Season.findOne({
			where: {
				Start: {
					[Op.lte]: Date.now()
				},
				End: {
					[Op.gte]: Date.now()
				}
			}
		}),
		req.db.Division.findAll({
			where: {
				IsActive: true
			}
		})
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
				SeasonId: req.body.season,
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
		req.db.User.findOne({
			where: {
				Email: req.body.email
			}
		}),
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

router.get('/import-prep', async (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

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

router.post('/import-prep', validator.body(Joi.object({
	url: Joi.string(), //not .uri() in case someone puts e.g. byba.online instead of http://byba.online
	key: Joi.string(),
	secret: Joi.string()
})), async (req, res) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	let config = await req.db.WooCommerceImportConfig.findOne();
	const found = config != null;

	if (!found) {
		config = {};
	}

	config.Domain = req.body.url;
	config.Key = req.body.key;
	config.Secret = req.body.secret;

	if (found){
		await config.save();
	} else {
		await req.db.WooCommerceImportConfig.create(config);
	}

	res.redirect('import');
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
		req.db.PaymentType.findAll({
			where: {
				IsActive: true
			}
		}),
		req.db.Division.findAll({
			where: {
				IsActive: true
			}
		})
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
