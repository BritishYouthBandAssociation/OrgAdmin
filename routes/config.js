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
	console.log(types);

	return res.render('config/membership-type.hbs', {
		title: 'Membership Types',
		types: types
	});
});

module.exports = {
	root: '/config/',
	router: router
};
