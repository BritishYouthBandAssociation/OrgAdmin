'use strict';

/* global __lib */

// Import modules
const express = require('express');
const router = express.Router();
const lib = require(__lib);

// Set up default route to check server is running
router.get('/', (req, res, next) => {
	//single equals to include undefined
	if (req.session.user != null) {
		return res.redirect('home');
	}

	return res.render('login', {
		title: 'Please Log In',
		layout: 'no-nav.hbs'
	});
});

router.post('/', async (req, res) => {
	let fields = null;
	try {
		fields = lib.helpers.ValidationHelper.validate(req.body, ['email', 'password'], {
			'email': 'email'
		}).fields;
	} catch (ex) {
		console.log('Invalid fields!');
		console.log(ex);
	}

	if (fields !== null) {
		const user = await req.db.User.findOne({
			where: {
				Email: fields.get('email'),
				IsActive: true
			}
		});

		if (user !== null && await user.validPassword(fields.get('password'))) {
			//successful login
			req.session.user = user.dataValues;
			const next = req.query.next ?? 'home';
			return res.redirect(next);
		}
	}

	return res.render('login', {
		title: 'Please Log In',
		error: 'Username or password incorrect. Please try again',
		email: fields.get('email'),
		layout: 'no-nav.hbs'
	});
});

router.get('/home', (req, res, next) => {
	return res.render('index', {
		title: 'Home',
		name: req.session.user.FirstName
	});
});

router.get('/logout', (req, res, next) => {
	req.session.destroy();
	return res.redirect('/');
});

router.post('/change-band', (req, res, next) => {
	if (req.body.changeBand == null){
		return next();
	}

	const band = req.session.user.bands.filter(b => b.id === req.body.changeBand);

	if (band.length > 0){
		req.session.band = band[0];
	}

	return res.redirect('back');
});

router.all('/no-access', (req, res, next) => {
	return res.render('no-access.hbs', {
		title: 'No Access',
		previousPage: req.query.page ?? ''
	});
});

module.exports = {
	root: '/',
	router: router
};
