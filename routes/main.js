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

router.post('/', (req, res) => {
	return res.render('login', {
		title: 'Please Log In'
	});
});

router.get('/test', (req, res) => {
	return res.render('index', {
		title: 'Uh oh'
	});
});

module.exports = {
	root: '/',
	router: router
};
