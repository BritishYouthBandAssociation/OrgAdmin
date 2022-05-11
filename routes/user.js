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

module.exports = {
	root: '/user/',
	router: router
};