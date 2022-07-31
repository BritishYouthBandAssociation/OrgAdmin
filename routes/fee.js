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

//this is only an api route for now?
router.post('/:id', async (req, res, next) => {
	const fee = await req.db.Fee.findByPk(req.params.id);
	const redir = req.query.redirect ?? req.get('Referrer');

	if (!fee) {
		return next();
	}

	const validationRes = lib.helpers.ValidationHelper.validate(req.body, [
		'paymentType'
	]);

	if (!validationRes.isValid) {
		console.error(validationRes.errors);
		return res.redirect(`${redir}?error=1`);
	}

	const fields = validationRes.fields;

	await fee.update({
		PaymentTypeId: fields.get('paymentType'),
		IsPaid: true
	});

	return res.redirect(`${redir}?saved=1`);
});

module.exports = {
	root: '/fee',
	router: router
};
