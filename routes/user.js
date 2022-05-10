'use strict';

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
	return res.render('user/index.hbs', {
		title: 'Users'
	});
});

module.exports = {
	root: '/user/',
	router: router
};