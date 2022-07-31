'use strict';

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
	return res.render('email/index.hbs', {
		title: 'Bulk Emailer'
	});
});

module.exports = {
	root: '/email',
	router: router
};