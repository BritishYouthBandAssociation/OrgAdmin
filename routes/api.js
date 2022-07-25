'use strict';

const express = require('express');
const router = express.Router();

router.get('/organisation', async (req, res) => {
	const where = {};

	if (req.query.type != null){
		where.OrganisationTypeID = req.query.type;
	}

	const orgs = await req.db.Organisation.findAll({
		include: [ req.db.OrganisationType ],
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
