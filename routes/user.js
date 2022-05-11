'use strict';

/* global __lib */

const express = require('express');
const router = express.Router();

const {
	repositories: {
		UserRepository
	}
} = require(__lib);

router.get('/', async (req, res) => {
	const users = await UserRepository.getAll(req.db);

	return res.render('user/index.hbs', {
		title: 'Users',
		users: users
	});
});

router.get('/:id', async (req, res, next) => {
	const user = await UserRepository.getByID(req.db, req.params.id);
	if(user == null){
		return next();
	}

	return res.render('user/view.hbs', {
		title: `${user.firstName} ${user.surname}`,
		user: user,
		saved: req.query.saved ?? false
	});
});

router.post('/:id', async (req, res, next) => {
	const user = await UserRepository.getByID(req.db, req.params.id);
	if(user == null){
		return next;
	}

	user.firstName = req.body.firstName;
	user.surname = req.body.surname;
	user.email = req.body.email;
	user.isActive = req.body.isActive;
	user.isAdmin = req.body.isAdmin;

	await UserRepository.update(req.db, user);

	return res.redirect(`${req.params.id}?saved=1`);
});

module.exports = {
	root: '/user/',
	router: router
};