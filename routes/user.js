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
		user: user
	});
});

module.exports = {
	root: '/user/',
	router: router
};