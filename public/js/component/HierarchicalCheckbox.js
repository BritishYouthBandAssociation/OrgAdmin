'use strict';
/*global Vue*/

Vue.component('hierarchical-checkbox', {
	props: ['items', 'textProp', 'dataProp', 'childProp', 'name'],
	template: `
	<ul style="list-style: none" class="mb-3" v-if="items.length > 0">
		<li v-for="item in items">
			<label :for="name + '-' + item[dataProp]">
				<input type="checkbox" :id="name + '-' + item[dataProp]" :name="name" />
				{{item[textProp]}}
			</label>
			<hierarchical-checkbox :items="item[childProp]" :text-prop="textProp" :data-prop="dataProp" :child-prop="childProp"></hierarchical-checkbox>
		</li>
	</ul>
	`
});