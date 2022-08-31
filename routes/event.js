'use strict';

/* global __lib */

const express = require('express');
const router = express.Router();

const {helpers: {ValidationHelper, SlugHelper: {formatSlug}}} = require(__lib);

const validDate = (date) => {
	date = date instanceof Date ? date : new Date(date);

	return !isNaN(date);
};

router.get('/', async (req, res) => {
	const [ events, eventTypes ] = await Promise.all([
		req.db.Event.findAll({
			include: [
				req.db.EventType
			]
		}),
		req.db.EventType.findAll()
	]);

	return res.render('event/index.hbs', {
		title: 'Events',
		years: [ '2022' ],
		year: '2022',
		events,
		filters: eventTypes
	});
});

router.get('/new', async (req, res) => {
	const types = await req.db.EventType.findAll({
		where: {
			IsActive: true
		}
	});

	return res.render('event/add.hbs', {
		title: 'Add New Event',
		types
	});
});

router.post('/new', async (req, res) => {
	const validationRes = ValidationHelper.validate(req.body, [
		'name',
		'type',
		'start',
		'end'
	]);

	if (!validationRes.isValid) {
		console.error(validationRes.errors);
		return res.redirect(req.params.id);
	}

	const fields = validationRes.fields;

	if (!(validDate(fields.get('start')) && validDate(fields.get('end')))) {
		console.error('Invalid dates');
		return res.redirect();
	}

	const eventType = await req.db.EventType.findOne({
		where: {
			id: fields.get('type')
		}
	});

	if (!eventType) {
		console.log('Invalid fields!');
		return res.redirect();
	}

	const startDate = new Date(fields.get('start'));

	const slug = formatSlug(`${startDate.getFullYear()}-${fields.get('name')}`);

	const event = await req.db.Event.create({
		Name: fields.get('name'),
		Start: fields.get('start'),
		End: fields.get('end'),
		Slug: slug
	});

	await event.setEventType(eventType);

	return res.redirect(event.id);
});

router.get('/:id', async (req, res, next) => {
	const [ event, types ] = await Promise.all([
		req.db.Event.findByPk(req.params.id, {
			include: [
				req.db.Address,
				req.db.EventType
			]
		}),
		req.db.EventType.findAll({
			where: {
				IsActive: true
			}
		})
	]);

	if (!event) {
		return next();
	}

	return res.render('event/view.hbs', {
		title: event.Name,
		event,
		types,
		saved: req.query.saved ?? false,
	});
});

router.post('/:id', async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id, {
		include: [ req.db.Address ]
	});

	if (!event) {
		return next();
	}

	const validationRes = ValidationHelper.validate(req.body, [
		'name',
		'type',
		'start',
		'end',
		'slug'
	]);

	if (!validationRes.isValid) {
		console.error(validationRes.errors);
		return res.redirect(req.params.id);
	}

	const fields = validationRes.fields;

	if (!(validDate(fields.get('start')) && validDate(fields.get('end')))) {
		console.error('Invalid dates');
		return res.redirect();
	}

	const addressProvided = req.body.lineOne && req.body.lineTwo && req.body.city && req.body.postcode;

	await event.update({
		Name: fields.get('name'),
		Type: fields.get('type'),
		Start: fields.get('start'),
		End: fields.get('end'),
		Slug: formatSlug(fields.get('slug'))
	});

	if (addressProvided) {
		const values = {
			Line1: fields.get('lineOne'),
			Line2: fields.get('lineTwo'),
			City: fields.get('city'),
			Postcode: fields.get('postcode'),
		};

		if (event.Address) {
			await event.Address.update(values);
		} else {
			const address = await req.db.Address.create(values);
			await event.setAddress(address);
		}
	}

	return res.redirect(`${req.params.id}?saved=1`);
});

router.post('/:id/registration', async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id);

	if (!event) {
		return next();
	}

	const validationRes = ValidationHelper.validate(req.body, [
		'registration-cutoff',
		'free-registration-cutoff'
	]);

	if (!validationRes.isValid) {
		console.error(validationRes.errors);
		return res.redirect(req.params.id);
	}

	const fields = validationRes.fields;

	await event.update({
		EntryCutoffDate: fields.get('registration-cutoff'),
		FreeEntryCutoffDate: fields.get('free-registration-cutoff'),
	});

	return res.redirect(`/event/${req.params.id}?saved=1`);
});

router.get('/:id/judges', async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id, {
		include: [req.db.Caption]
	});

	if (!event) {
		return next();
	}

	res.render('event/judges.hbs', {
		title: `Judges for ${event.Name}`,
		event: event,
		success: req.query.success ?? false
	});
});

async function loadCaption(db, parent){
	parent.Subcaptions = await db.findAll({
		where: {
			ParentID: parent.id
		}
	});

	await Promise.all(parent.Subcaptions.map(s => {
		return loadCaption(db, s);
	}));

	return parent;
}

function filterCaptions(arr, caption){
	if (caption.Subcaptions.length > 0 && caption.Subcaptions[0].Subcaptions.length === 0){
		//we have found our weird mid-level!
		arr.push(caption);
		return arr;
	}

	caption.Subcaptions.forEach(c => {
		arr = filterCaptions(arr, c);
	});

	return arr;
}

router.post('/:id/judges/reset', async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id);
	if (!event) {
		return next();
	}

	//load top level
	const captionData = await req.db.Caption.findAll({
		where: {
			ParentID: null
		}
	});

	//load the rest
	await Promise.all(captionData.map(c => {
		return loadCaption(req.db.Caption, c);
	}));

	const captions = [];
	captionData.forEach(c => filterCaptions(captions, c));

	event.setCaptions(captions);

	res.redirect('../judges/?success=true');
});

module.exports = {
	root: '/event',
	router: router
};
