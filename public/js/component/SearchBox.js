'use strict';
/*global Vue*/

Vue.component('search-box', {
	props: ['placeholder', 'title', 'name', 'url', 'text', 'value', 'textProp', 'valueProp', 'isArray'],
	data: function() {
		return {
			results: [],
			noneFound: false,
			_text: '',
			_value: ''
		};
	},
	template: `
	<div class="position-relative">
		<div class="form-group">
			<label :for="getName('search')">{{title}}</label>
			<input type="text" class="form-control" :name="getName('search')" :id="getName('search')" :placeholder="placeholder" v-on:keydown.enter.prevent @keyup="doSearch" v-model="$data._text" autocomplete="off" />

			<input type="hidden" :name="getName()" v-model="$data._value" />
		</div>

		<div class="search-results-container" v-if="results.length > 0">
			<div class="search-result" v-for="result in results" @click="setResult(result)">{{result[textProp]}}</div>
		</div>

		<div class="search-not-found" v-if="noneFound">No results found</div>
	</div>
	`,
	methods: {
		doSearch(e) {
			this.$data._text = e.target.value; //mobile workaround

			//we've changed the text, so should clear any previously-selected value
			this.$data._value = null;

			if (this.$data._text.length < 3) {
				this.results = [];
				this.noneFound = false;
				return;
			}

			fetch(`${this.url}?q=${this.$data._text}`).then(res => res.json())
				.then(json => {
					this.results = json;
					this.noneFound = json.length === 0;
				});
		},

		setResult(result){
			this.$data._value = result[this.valueProp];
			this.$data._text = result[this.textProp];
			this.results = [];
		},

		getName(suffix){
			suffix ??= '';

			let name = this.name;

			if (suffix.trim().length > 0){
				name += `_${suffix}`;
			}

			if (this.isArray){
				name += '[]';
			}

			return name;
		}
	},
	mounted: function(){
		this.$data._text = this.text;
		this.$data._value = this.value;
	}
});
