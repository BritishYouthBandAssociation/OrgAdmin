'use strict';
/*global Vue*/

Vue.component('hierarchical-checkbox', {
	props: ['items', 'textProp', 'dataProp', 'childProp', 'name', 'hideEmpty'],
	template: `
	<ul style="list-style: none" class="mb-3">
		<li v-for="(item, index) in items" :key="item.id" v-if="!hideEmpty || item[childProp].length > 0">
			<label :for="name + '-' + item[dataProp]">
				<input type="checkbox" :id="name + '-' + item[dataProp]" :name="name + '[]'" v-model="item.checked" :value="item[dataProp]" v-on:click="checkChildren(!item.checked, index)"/>
				{{item[textProp]}} 
			</label>
			<hierarchical-checkbox ref="theChild" :items="item[childProp]" :text-prop="textProp" :data-prop="dataProp" :child-prop="childProp" :name="name" :hide-empty="hideEmpty"></hierarchical-checkbox>
		</li>
	</ul>
	`,
	mounted: function() {
		this.items.forEach(i => {
			if (typeof i.checked === 'undefined') {
				this.$set(i, 'checked', false);
			}
		});
	},
	methods: {
		checkItems(checked) {
			for (let i = 0; i < this.items.length; i++) {
				this.items[i].checked = checked;
			}

			this.checkChildren(checked, -1);
		},

		checkChildren(checked, index) {
			if (this.$refs.theChild) {
				if (index === -1) {
					this.$refs.theChild.forEach(c => {
						c.checkItems(checked);
					});
				} else if (this.$refs.theChild.length > index) {
					this.$refs.theChild[index].checkItems(checked);
				}
			}
		}
	}
});