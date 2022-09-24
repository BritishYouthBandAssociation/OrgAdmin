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

	if (!season){
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

	const [ types, season, divisions, member ] = await Promise.all(promises);

	if (!season){
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


// TODO refactor into two routes - one for individual and one for org memberships
// add validation
router.post('/new', async (req, res, next) => {
	const type = await req.db.MembershipType.findOne({
		where: {
			id: req.body.type
		}
	});

	if (!type) {
		return res.redirect();
	}

	if (type.IsOrganisation) {
		if (req.body.notFound === 'true') {
			return res.redirect(`/organisation/new?membershipType=${req.body.type}`);
		}

		const exists = await req.db.Membership.findOne({
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
		});

		if (exists != null) {
			//if this band already has a membership this season, display it
			return res.redirect(exists.id);
		}

		//create the membership
		const membership = await req.db.Membership.create({
			SeasonId: req.body.season,
			MembershipTypeId: req.body.type
		});

		//add the band to the membership
		await req.db.OrganisationMembership.create({
			OrganisationId: req.body.organisation,
			MembershipId: membership.id,
			DivisionId: req.body.division
		});

		//display it
		return res.redirect(membership.id);
	}

	//we have an individual membership here
	const exists = await req.db.User.findOne({
		where: {
			Email: req.body.email
		}
	});

	if (!exists) {
		//if not a current user, make them create one first
		return res.redirect(`/user/new?email=${req.body.email}&membership=${type.id}`);
	}

	//do they already have a membership for this season?
	const eMemb = await req.db.Membership.findOne({
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

	if (eMemb !== null) {
		return res.redirect(eMemb.id);
	}

	//create the membership
	const membership = await req.db.Membership.create({
		SeasonId: req.body.season,
		MembershipTypeId: req.body.type
	});

	//add the individual to the membership
	await req.db.IndividualMembership.create({
		UserId: exists.id,
		MembershipId: membership.id
	});

	//display it
	return res.redirect(`${membership.id}/`);
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
	const [ membership, division ] = await Promise.all([
		req.db.Membership.findByPk(req.params.id, {
			include: req.db.OrganisationMembership
		}),
		req.db.Division.findByPk(req.body.division)
	]);

	if (!membership | !division) {
		return next();
	}

	await membership.OrganisationMembership.setDivision(division);

	return res.redirect('./?saved=true');
});

module.exports = {
	root: '/membership/',
	router: router
};
