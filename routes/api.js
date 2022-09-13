'use strict';

const express = require('express');
const router = express.Router();

const { Op } = require('sequelize');

router.get('/organisation', async (req, res) => {
	const where = {};
	const include = new Set();

	include.add({
		model: req.db.OrganisationUser,
		include: [{
			model: req.db.User,
			attributes: ['FirstName', 'Surname', 'Email']
		}]
	});

	if (req.query.type != null) {
		where.OrganisationTypeID = req.query.type;
		include.add(req.db.OrganisationType);
	}

	const orgs = await req.db.Organisation.findAll({
		include: include.size > 0 ? Array.from(include) : null,
		where: where
	});

	res.json(orgs);
});

router.get('/organisation/search', async (req, res) => {
	const orgs = await req.db.Organisation.findAll({
		include: [req.db.OrganisationType],
		where: {
			Name: {
				[req.db.Sequelize.Op.like]: `%${req.query.q}%`
			}
		}
	});

	res.json(orgs);
});

router.get('/membership/:season', async (req, res) => {
	const where = {
		SeasonId: req.params.season
	};

	if (req.query.type){
		where.MembershipTypeId = req.query.type;
	}

	const members = await req.db.Membership.findAll({
		include: [
			req.db.Label,
			req.db.MembershipType,
			{
				model: req.db.IndividualMembership,
				include: [req.db.User]
			},
			{
				model: req.db.OrganisationMembership,
				include: {
					model: req.db.Organisation,
					include: [req.db.OrganisationType]
				}
			}
		],
		where: where
	});

	res.json(members);
});

router.get('/caption/:id/judges/search', async (req, res, next) => {
	const caption = await req.db.Caption.findByPk(req.params.id);

	if (!caption){
		return next();
	}

	const judges = await req.db.User.findAll({
		include: [{
			model: req.db.Caption,
			where: {
				id: caption.id
			}
		}],
		where: {
			[Op.or]: {
				FirstName: {
					[Op.like]: `%${req.query.q}%`
				},
				Surname: {
					[Op.like]: `%${req.query.q}%`
				}
			}
		}
	});

	res.json(judges);
});

module.exports = {
	root: '/_api/',
	router: router
};
