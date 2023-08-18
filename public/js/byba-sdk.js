'use strict';

/* global BASE_API */

let byba = {};

(function() {
	let user = JSON.parse(localStorage.getItem('user'));

	//temp
	function fixDate(d) {
		const date = new Date(d);
		return [date.getDay().toString().padStart(2, '0'), (date.getMonth() + 1).toString().padStart(2, '0'), date.getFullYear()].join('/');
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
			async list(sort = false) {
				const query = sort ? { sort: 'date' } : null;
				return await get('/events', query);
			},

			async get(id) {
				return await get(`/events/${id}`);
			},

			async update(id, data) {
				const _origDate = data.date;
				data.date = fixDate(data.date);
				const response = await patch(`/events/${id}`, data);
				data.date = _origDate;
				return response;
			},

			async create(name, date, startTime, endTime) {
				return await post('/events/', { name, date: fixDate(date), startTime, endTime });
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