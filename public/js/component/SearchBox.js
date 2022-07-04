'use strict';
/*global Vue*/

Vue.component('search-box', {
	props: ['placeholder', 'title', 'name', 'url', 'textProp', 'valueProp'],
	data: function() {
		return {
			text: '',
			value: '',
			results: [],
			noneFound: false
		};
	},
	template: `
	<div>
		<div class="form-group">
			<label :for="name + '_search'">{{title}}</label>
			<input type="text" class="form-control" :name="name + '_search'" :id="name + '_search'" :placeholder="placeholder" @keyup="doSearch" v-model="text" />

			<input type="hidden" :name="name" v-model="value" />
		</div>

		<div class="search-results-container" v-if="results.length > 0">
			<div class="search-result" v-for="result in results" @click="value = result[valueProp]; text = result[textProp]; results = []">{{result[textProp]}}</div>
		</div>

		<div class="search-not-found" v-if="noneFound">No results found</div>
	</div>
	`,
	methods: {
		doSearch() {
			if (this.text.length < 3) {
				this.results = [];
				this.noneFound = false;
				return;
			}

			fetch(`${this.url}?q=${this.text}`).then(res => res.json())
				.then(json => {
					this.results = json;
					this.noneFound = json.length === 0;
				});
		}
	}
});