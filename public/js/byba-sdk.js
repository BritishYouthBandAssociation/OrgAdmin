'use strict';

let byba = {};

(function(){
	const BASE_API = 'https://dev.payload.byba.online/api';

	let user = JSON.parse(localStorage.getItem('user'));

	async function makeAPIRequest(url, options = {}){
		options.credentials = 'include';
		options.headers ??= {};
		options.headers['Content-Type'] = 'application/json';

		const response = await fetch(`${BASE_API}${url}`, options);
		const json = await response.json();

		return {
			status: response.status,
			json
		};
	}

	//Read
	async function get(url){
		return await makeAPIRequest(url);
	}

	//Create
	async function post(url, body){
		return await makeAPIRequest(url, {
			method: 'POST',
			body: JSON.stringify(body),
		});
	}

	//Update
	async function patch(url, body){
		return await makeAPIRequest(url, {
			method: 'PATCH',
			body: JSON.stringify(body)
		});
	}

	byba = {
		async login(email, password){
			const response = await post('/users/login', {email, password});
			user = response.json.user;
			localStorage.setItem('user', JSON.stringify(user));
			return response;
		},

		amAdmin(){
			return user?.role === 'admin';
		},

		creator(resource = null){
			return resource?.createdBy === user.id;
		},

		events: {
			list(){
				return get('/events');
			},

			get(id){
				return get(`/events/${id}`);
			},

			update(id, data){
				return patch(`/events/${id}`, data);
			}
		},

		seasons: {
			getCurrent(){
				return get('/seasons/current');
			},

			list(){
				return get('/seasons');
			}
		}
	};
})();