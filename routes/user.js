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
	const active = [];
	const inactive = [];
	const users = await UserRepository.getAll(req.db);

	users.forEach(u => {
		if(u.isActive){
			active.push(u);
		} else {
			inactive.push(u);
		}
	});

	return res.render('user/index.hbs', {
		title: 'Users',
		active: active,
		inactive: inactive
	});
});

router.get('/new', (req, res) => {
	return res.render('user/add.hbs', {
		title: 'Add New User'
	});
});

router.post('/new', async (req, res) => {
	req.body.isActive = parseInt(req.body.isActive);
	req.body.isAdmin = parseInt(req.body.isAdmin);

	const match = await UserRepository.getByEmail(req.db, req.body.email);
	let err = "";
	if(match != null){
		err = 'A user with that email address already exists';
	}

	if(req.body.password !== req.body.confirm){
		err = 'Passwords do not match';
	}

	if(err !== ""){
		return res.render('user/add.hbs', {
			title: "Add New User",
			error: err,
			details: req.body
		});
	}

	const userID = await UserRepository.add(req.db, req.body.email, req.body.password, req.body.firstName, req.body.surname, req.body.isActive, req.body.isAdmin);

	return res.redirect(userID);
});

router.post('/:id/password', async (req, res, next) => {
	const user = await UserRepository.getByID(req.db, req.params.id);
	if(user == null){
		return next();
	}

	if(req.body.password !== req.body.confirm){
		return res.redirect(`../${req.params.id}?nomatch=1`);
	}

	await UserRepository.setPassword(req.db, req.params.id, req.body.password);
	return res.redirect(`../${req.params.id}?saved=1`);
});

router.get('/:id', async (req, res, next) => {
	const user = await UserRepository.getByID(req.db, req.params.id);
	if(user == null){
		return next();
	}

	return res.render('user/view.hbs', {
		title: `${user.firstName} ${user.surname}`,
		user: user,
		saved: req.query.saved ?? false,
		nomatch: req.query.nomatch ?? false
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