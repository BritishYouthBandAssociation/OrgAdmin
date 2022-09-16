'use strict';

// Import modules
const express = require('express');
const router = express.Router();
const Joi = require('joi');

const validator = require('@byba/express-validator');

router.get('/', (req, res, next) => {
	if (req.session.user) {
		return res.redirect('home');
	}

	return res.render('login', {
		title: 'Please Log In',
		layout: 'no-nav.hbs'
	});
});

router.post('/', validator.body(Joi.object({
	email: Joi.string()
		.email()
		.required(),
	password: Joi.string()
		.required()
})), validator.query(Joi.object({
	next: Joi.string()
})), async (req, res, next) => {
	const user = await req.db.User.findOne({
		where: {
			Email: req.body.email,
			IsActive: true
		}
	});

	// either returns if the password is valid, or undefined if no user was found
	const validLogin = await user?.validPassword(req.body.password);

	if (!validLogin) {
		return res.render('login', {
			title: 'Please Log In',
			error: 'Username or password incorrect. Please try again',
			email: req.body.email,
			layout: 'no-nav.hbs'
		});
	}

	req.session.user = user.dataValues;
	const nextPage = req.query.next ?? 'home';
	return res.redirect(nextPage);
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

router.post('/change-band', validator.body(Joi.object({
	changeBand: Joi.number()
		.required()
})), (req, res, next) => {
	const band = req.session.user.bands.filter(b => b.id === req.body.changeBand);

	if (band.length > 0){
		req.session.band = band[0];
	}

	return res.redirect('back');
});

router.all('/no-access', validator.query(Joi.object({
	page: Joi.string()
})), (req, res, next) => {
	return res.render('no-access.hbs', {
		title: 'No Access',
		previousPage: req.query.page ?? ''
	});
});

module.exports = {
	root: '/',
	router: router
};
