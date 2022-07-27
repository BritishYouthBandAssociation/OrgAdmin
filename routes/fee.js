'use strict';

/* global __lib */

const express = require('express');
const router = express.Router();

const lib = require(__lib);

router.get('/', (req, res) => {
	return res.render('fee/index.hbs', {
		title: 'Outstanding Fees'
	});
});

router.post('/:id', async (req, res, next) => {
	const fee = await req.db.Fee.findByPk(req.params.id);

	if (!fee) {
		return next();
	}

	const validationRes = lib.helpers.ValidationHelper.validate(req.body, [
		'paymentType'
	]);

	if (!validationRes.isValid) {
		console.error(validationRes.errors);
		return res.redirect(req.params.id);
	}

	const fields = validationRes.fields;

	await fee.update({
		PaymentTypeId: fields.get('paymentType'),
		IsPaid: true
	});

	return res.redirect(`${req.params.id}?saved=1`);
});

module.exports = {
	root: '/fee',
	router: router
};
