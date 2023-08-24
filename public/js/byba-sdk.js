'use strict';

/* global BASE_API */

let byba = {};

(function() {
	let user = JSON.parse(localStorage.getItem('user'));

	function getTimeFromDate(date){
		return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
	}

	function formatEvent(event){
		const startDate = new Date(event.start);
		const endDate = new Date(event.end);
		const eventDate = new Date(startDate.toDateString());

		delete event.start;
		delete event.end;

		return {
			...event,
			date: eventDate,
			startTime: getTimeFromDate(startDate),
			endTime: getTimeFromDate(endDate)
		};
	}

	async function makeAPIRequest(url, options = {}) {
		options.credentials = 'include';
		options.headers ??= {};
		options.headers['Content-Type'] = 'application/json';

		try {
			const response = await fetch(`${BASE_API}${url}`, options);
			const json = await response.json();

			const result = {
				status: response.status,
				json,
				success: Math.floor(response.status / 100) === 2
			};

			if (json.errors) {
				result.errors = json.errors.flatMap(e => {
					if (e.name === 'ValidationError' && e.data) {
						return e.data.map(d => `${d.field} is invalid: ${d.message}`);
					}

					return e.message;
				});
			}

			return result;
		} catch (ex){
			//usually only network interruptions?
			return {
				status: 500,
				exception: ex,
				success: false,
				errors: ['An unexpected error occurred. Please try again!']
			};
		}
	}

	//Read
	async function get(url, queryParams = null) {
		if (queryParams != null) {
			url += `?${new URLSearchParams(queryParams)}`;
		}

		return await makeAPIRequest(url);
	}

	//Create
	async function post(url, body) {
		return await makeAPIRequest(url, {
			method: 'POST',
			body: JSON.stringify(body),
		});
	}

	//Update
	async function patch(url, body) {
		return await makeAPIRequest(url, {
			method: 'PATCH',
			body: JSON.stringify(body)
		});
	}

	byba = {
		async login(email, password) {
			const response = await post('/users/login', { email, password });

			if (response.success){
				user = response.json.user;
				localStorage.setItem('user', JSON.stringify(user));
			}

			return response;
		},

		amAdmin() {
			return user?.role === 'admin';
		},

		creator(resource = null) {
			return resource?.createdBy === user.id;
		},

		events: {
			async list(season, {sort = true, after = null} = {}) {
				const query = {
					'where[season][equals]': season
				};

				if (sort){
					query.sort = 'start';
				}

				if (after){
					query['where[start][greater_than]'] = after;
				}

				const response = await get('/events', query);
				if (response.success){
					response.json.docs = response.json.docs.map(d => formatEvent(d));
				}
				return response;
			},

			async get(id) {
				const response = await get(`/events/${id}`);
				if (response.success){
					response.json = formatEvent(response.json);
				}
				return response;
			},

			async update(id, data) {
				const start = new Date(`${data.date}T${data.startTime}`);
				const end = new Date(`${data.date}T${data.endTime}`);

				const payload = {...data, start, end};

				delete payload.date;
				delete payload.startTime;
				delete payload.endTime;

				return await patch(`/events/${id}`, payload);
			},

			async create(name, date, startTime, endTime) {
				const start = new Date(`${date}T${startTime}`);
				const end = new Date(`${date}T${endTime}`);
				return await post('/events/', { name, start, end });
			}
		},

		seasons: {
			async getCurrent() {
				return await get('/seasons/current');
			},

			async list() {
				return await get('/seasons');
			}
		}
	};
})();