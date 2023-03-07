'use strict';

// Import modules
const express = require('express');
const Joi = require('joi');

const validator = require('@byba/express-validator');
const { checkAdmin } = require('../middleware');

const {
	helpers: {
		SortHelper
	}
} = require(global.__lib);

const router = express.Router();

const idParamSchema = Joi.object({
	id: Joi.string()
		.guid()
		.required()
});

router.get('/', checkAdmin, validator.query(Joi.object({
	status: Joi.string().optional()
})), async (req, res, next) => {
	const orderWhere = {};
	if (req.query.status && req.query.status !== 'all') {
		orderWhere.Status = req.query.status;
	}

	const orders = (await req.db.Order.findAll({ where: orderWhere })).sort((a, b) => SortHelper.dateProp('Date', a, b, false));
	const orderStatuses = req.db.Order.getAttributes().Status.values;

	return res.render('order/index.hbs', {
		title: 'Orders',
		orders,
		orderStatuses,
		currentStatus: req.query.status ?? 'all'
	});
});

router.get('/:id', checkAdmin, validator.params(idParamSchema), async (req, res, next) => {
	const order = await req.db.Order.findByPk(req.params.id);

	if (!order) {
		return next();
	}

	return res.render('order/view.hbs', {
		title: `Order ${order.id}`,
		order,
		paymentMethods: req.db.Order.getAttributes().PaymentMethod.values
	});
});

router.post('/:id', checkAdmin, validator.params(idParamSchema), async (req, res, next) => {
	const paymentMethods = req.db.Order.getAttributes().PaymentMethod.values;

	// this isn't validated in the middleware because we need req.db to get possible values
	if (!paymentMethods.includes(req.body.paymentMethod)) {
		return next();
	}

	const order = await req.db.Order.findByPk(req.params.id);

	if (!order) {
		return next();
	}

	// from this point all payment methods use square in soma capacity, and are no longer pending
	await order.update({
		PaymentMethod: req.body.paymentMethod,
		Status: 'processing',
		ExternalPaymentProvider: 'square'
	});

	switch (req.body.paymentMethod) {
		case 'cheque':
		case 'bankTransfer':
		case 'cash': {
			// do square stuff

			// send off to treasurer for confirmation
			await order.update({
				Status: 'awaitingConfirmation'
			});

			break;
		}
		case 'online': {
			// This is a proper payment portal

			break;
		}
	}

	return res.redirect(`/order/${req.params.id}/`);
});

module.exports = {
	root: '/order/',
	router: router
};
