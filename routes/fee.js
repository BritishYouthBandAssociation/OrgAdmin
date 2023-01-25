'use strict';

const express = require('express');
const Joi = require('joi');
const router = express.Router();

const validator = require('@byba/express-validator');
const { checkAdmin } = require('../middleware');

router.get('/', (req, res, next) => {
	return res.render('fee/index.hbs', {
		title: 'Outstanding Fees'
	});
});

//this is only an api route for now?
router.post('/:id', checkAdmin, validator.query(Joi.object({
	redirect: Joi.string()
})), validator.params(Joi.object({
	id: Joi.number()
		.integer()
		.required()
})), validator.body(Joi.object({
	paymentType: Joi.number()
		.integer()
		.required()
})), async (req, res, next) => {
	const fee = await req.db.Fee.findByPk(req.params.id);
	const redir = req.query.redirect ?? req.get('Referrer');

	if (!fee) {
		return next();
	}

	await fee.update({
		IsPaid: true
	});

	await fee.setPaymentType(req.body.paymentType);

	return res.redirect(redir);
});

module.exports = {
	root: '/fee',
	router: router
};
