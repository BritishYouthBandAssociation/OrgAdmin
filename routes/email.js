'use strict';

const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
	const types = await req.db.MembershipType.findAll({
		where: {
			IsActive: true
		}
	});

	return res.render('email/index.hbs', {
		title: 'Bulk Emailer',
		types: types,
		season: 2022
	});
});

module.exports = {
	root: '/email',
	router: router
};