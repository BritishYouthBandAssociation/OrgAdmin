'use strict';

// Import modules
const express = require('express');
const router = express.Router();

// Set up default route to check server is running
router.get('/', (req, res) => {
	return res.render('login', {
		title: 'Please Log In'
	});
});

module.exports = {
	root: '/',
	router: router
};
