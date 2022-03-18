'use strict';

/* global __lib */

// Import modules
const express = require('express');
const router = express.Router();
const lib = require(__lib);

// Set up default route to check server is running
router.get('/', (req, res) => {
	return res.render('login', {
		title: 'Please Log In'
	});
});

router.post('/', async (req, res) => {
	const user = await lib.repositories.UserRepository.getUserByLogin(req.db, req.body.email, req.body.password);

	if(user != null){
		//successful login
		res.redirect("test");
	}

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
