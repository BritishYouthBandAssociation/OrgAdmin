'use strict';

const express = require('express');
const router = express.Router();

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

	if (req.query.membership != null) {
		const where = {
			Season: req.query.season ?? 2022 //TODO unhardcode
		};

		if (req.query.membership !== '*'){
			where.MembershipTypeId = req.query.membership;
		}

		include.add({
			model: req.db.OrganisationMembership,
			include: [{
				model: req.db.Membership,
				where: where,
				required: true
			}],
			required: true
		});
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

module.exports = {
	root: '/_api/',
	router: router
};
