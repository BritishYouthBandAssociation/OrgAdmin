'use strict';

/* global __lib */

// Import modules
const express = require('express');
const router = express.Router();
const lib = require(__lib);

// Set up default route to check server is running
router.get('/', (req, res) => {
	if (req.session.user != null) {
		return res.redirect("home");
	}

	return res.render('login', {
		title: 'Please Log In'
	});
});

router.post('/', async (req, res) => {
	let fields = null;
	try {
		fields = lib.helpers.ValidationHelper.validate(req.body, ['email', 'password'], {
			'email': 'email'
		}).fields;
	} catch (ex) {
		console.log("Invalid fields!");
		console.log(ex);
	}

	if (fields != null) {
		const user = await lib.repositories.UserRepository.getUserByLogin(req.db, req.body.email, req.body.password);

		if (user != null) {
			//successful login
			req.session.user = user;
			const next = req.query.next ?? "home";
			return res.redirect(next);
		}
	}

	return res.render('login', {
		title: 'Please Log In',
		error: 'Username or password incorrect. Please try again'
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
