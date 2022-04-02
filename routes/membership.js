'use strict';

// Import modules
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
	return res.render('membership/index.hbs', {
		title: "Membership"
	});
});

module.exports = {
	root: '/membership/',
	router: router
};
