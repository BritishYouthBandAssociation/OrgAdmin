'use strict';
/*global Vue*/

Vue.component('hierarchical-checkbox', {
	props: ['items', 'textProp', 'dataProp', 'childProp', 'name', 'hideEmpty', 'parent'],
	template: `
	<ul style="list-style: none" class="mb-3">
		<li v-for="(item, index) in items" :key="item.id" v-if="!hideEmpty || item[childProp].length > 0">
			<label :for="name + '-' + item[dataProp]">
				<input type="checkbox" :id="name + '-' + item[dataProp]" :name="name + '[]'" :value="item[dataProp]" v-model="item.checked" v-on:click="toggleCheck(item, index)"/>
				{{item[textProp]}} 
			</label>
			<hierarchical-checkbox ref="theChild" :items="item[childProp]" :text-prop="textProp" :data-prop="dataProp" :child-prop="childProp" :name="name" :hide-empty="hideEmpty" :parent='item.id'></hierarchical-checkbox>
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
		toggleCheck(item, index){
			//Vue wasn't toggling fast enough!
			item.checked = !item.checked;
			this.cascadeCheck(item.checked, index);
		},

		checkItems(checked) {
			for (let i = 0; i < this.items.length; i++) {
				this.items[i].checked = checked;
			}

			this.cascadeCheck(checked, -1);
		},

		cascadeCheck(checked, index) {
			if (this.$refs.theChild) {
				if (index === -1) {
					this.$refs.theChild.forEach(c => {
						c.checkItems(checked);
					});
				} else if (this.$refs.theChild.length > index) {
					this.$refs.theChild[index].checkItems(checked);

					if (this.parent){
						this.$parent.items.filter(i => i.id === this.parent)[0].checked = this.items.every(i => i.checked);
					}
				}
			}
		}
	}
});