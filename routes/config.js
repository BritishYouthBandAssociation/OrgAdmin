'use strict';

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
	return res.render('config/index.hbs', {
		title: 'Configuration'
	});
});

router.get('/membership-type', async (req, res) => {
	const types = await req.db.MembershipType.findAll();

	return res.render('config/membership-type.hbs', {
		title: 'Membership Types',
		types: types,
		saved: req.query.saved ?? false
	});
});

router.post('/membership-type', async (req, res) => {
	for (let i = 0; i < req.body.type.length; i++){
		if (req.body.id[i] < 0){
			//insert
			await req.db.MembershipType.create({
				Name: req.body.type[i],
				IsActive: req.body.isActive[i],
				IsOrganisation: req.body.isOrganisation[i],
				Cost: req.body.cost[i]
			});
		} else {
			//update
			await req.db.MembershipType.update({
				Name: req.body.type[i],
				IsActive: req.body.isActive[i],
				IsOrganisation: req.body.isOrganisation[i],
				Cost: req.body.cost[i]
			}, {
				where: {
					id: req.body.id[i]
				}
			});
		}
	}

	return res.redirect("?saved=1");
});

router.get('/organisation-type', async (req, res) => {
	const types = await req.db.OrganisationType.findAll();

	return res.render('config/organisation-type.hbs', {
		title: 'Organisation Types',
		types: types,
		saved: req.query.saved ?? false
	});
});

router.post('/organisation-type', async (req, res) => {
	for (let i = 0; i < req.body.type.length; i++){
		if (req.body.id[i] < 0){
			//insert
			await req.db.OrganisationType.create({
				Name: req.body.type[i],
				IsActive: req.body.isActive[i]
			});
		} else {
			//update
			await req.db.MembershipType.update({
				Name: req.body.type[i],
				IsActive: req.body.isActive[i]
			}, {
				where: {
					id: req.body.id[i]
				}
			});
		}
	}

	return res.redirect("?saved=1");
});

module.exports = {
	root: '/config/',
	router: router
};
