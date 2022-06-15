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
				Cost: req.body.cost[i]
			});
		} else {
			//update
		}
	}

	return res.redirect("?saved=1");
});

module.exports = {
	root: '/config/',
	router: router
};
