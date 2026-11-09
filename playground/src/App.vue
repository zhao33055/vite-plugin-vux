<!-- <template>
  <div>
    <divider>default</divider>
    <box gap="10px 10px">
      <x-button>submit</x-button>
      <x-button type="primary">primary</x-button>
      <x-button type="warn">Delete</x-button>

      <divider>link</divider>
      <x-button type="primary" link="/demo">Go to demo list</x-button>
      <x-button type="default" link="BACK">Back</x-button>

      <divider>action type</divider>
      <x-button type="primary" action-type="button">submit</x-button>
      <x-button type="warn" action-type="reset">reset</x-button>

      <divider>loading</divider>
      <x-button type="default" show-loading>submit</x-button>
      <x-button type="primary" show-loading>submit</x-button>
      <x-button type="warn" show-loading>submit</x-button>

      <divider>mini</divider>
      <x-button mini>submit</x-button>
      <x-button mini type="primary">primary</x-button>
      <x-button mini type="warn">Delete</x-button>
      <br>
      <x-button mini plain>submit</x-button>
      <x-button mini plain type="primary">primary</x-button>
      <x-button mini plain type="warn">primary</x-button>

      <divider>plain</divider>
      <x-button plain>submit</x-button>
      <x-button plain type="primary">primary</x-button>
      <x-button plain type="warn">warn</x-button>

      <divider>you can customize styles</divider>
      <x-button plain type="primary" style="border-radius:99px;">primary</x-button>
      <x-button plain type="primary" class="custom-primary-red">primary</x-button>

      <divider>disabled</divider>
      <x-button disabled>disable submit</x-button>
      <x-button type="primary" disabled>disable primary</x-button>
      <x-button type="warn" disabled>disable Delete</x-button>

      <x-button mini disabled>disable mini submit</x-button>
      <x-button mini type="primary" disabled>disable mini primary</x-button>
      <x-button mini type="warn" disabled>disable mini Delete</x-button>

      <x-button plain disabled>disable plain</x-button>
      <x-button plain type="primary" disabled>disable plain primary</x-button>

      <divider>use :text and :disabled</divider>
      <x-button :text="submit001" :disabled="disable001" @click.native="processButton001" type="primary"></x-button>

      <divider>combined with flexbox</divider>
      <flexbox>
        <flexbox-item>
          <x-button type="primary">primary</x-button>
        </flexbox-item>
        <flexbox-item>
          <x-button type="warn">Delete</x-button>
        </flexbox-item>
      </flexbox>
      <divider>combined with flexbox</divider>
      <flexbox>
        <flexbox-item>
          <x-button type="default">default</x-button>
        </flexbox-item>
        <flexbox-item>
          <x-button type="primary">primary</x-button>
        </flexbox-item>
        <flexbox-item>
          <x-button type="warn">Delete</x-button>
        </flexbox-item>
      </flexbox>

    </box>

    <divider>iOS Gradients(v2.7.4)</divider>
    <box gap="10px 10px">
      <x-button :gradients="['#1D62F0', '#19D5FD']">iOS Gradients</x-button>
      <x-button :gradients="['#A644FF', '#FC5BC4']">iOS Gradients</x-button>
      <x-button :gradients="['#FF2719', '#FF61AD']">iOS Gradients</x-button>
      <x-button :gradients="['#6F1BFE', '#9479DF']">iOS Gradients</x-button>
      <x-button :gradients="['#FF5E3A', '#FF9500']">iOS Gradients</x-button>
    </box>

  </div>
</template>

<script>
import { XButton, Box, GroupTitle, Group, Flexbox, FlexboxItem, Divider } from 'vux'

export default {
  components: {
    XButton,
    Box,
    GroupTitle,
    Group,
    Flexbox,
    FlexboxItem,
    Divider
  },
  methods: {
    change (value) {
      console.log('change:', value)
    },
    processButton001 () {
      this.submit001 = 'processing'
      this.disable001 = true
    }
  },
  data () {
    return {
      submit001: 'click me',
      disable001: false
    }
  }
}
</script>

<style lang="less">
.custom-primary-red {
  border-radius: 99px!important;
  border-color: #CE3C39!important;
  color: #CE3C39!important;
  &:active {
    border-color: rgba(206, 60, 57, 0.6)!important;
    color: rgba(206, 60, 57, 0.6)!important;
    background-color: transparent;
  }
}
</style> -->

<!--
  Smoke page for the three plugin capabilities:
  1. auto-import   - the components below come from `import { ... } from "vux"`.
  2. less-theme    - `@theme-color` and friends resolve from src/theme.less,
                     including inside vux's own styles.
  3. i18n          - vux's internal `$t('...')` calls are replaced with literals.
-->
<template>
  <div>
    <group>
      <x-input title="姓名" v-model="name" placeholder="请输入姓名"></x-input>
      <x-button type="primary" @click.native="count++">点击 次</x-button>
    </group>

    <divider>已点击 {{ count }} 次</divider>

    <box gap="10px">
      <button-tab v-model="tabIndex">
        <button-tab-item>Tab A</button-tab-item>
        <button-tab-item>Tab B</button-tab-item>
      </button-tab>
      <x-switch v-model="checked" title="主题开关"></x-switch>
      <x-button @click.native="showSheet = true">打开 ActionSheet</x-button>
    </box>

    <!-- Its cancel button text comes from `$t('cancel')`, which the i18n
         plugin replaces with the zh-CN literal at build time. -->
    <actionsheet v-model="showSheet" :menus="menus" show-cancel></actionsheet>

    <p class="theme-probe">这行文字的颜色来自 theme.less 的 @theme-color</p>

    <!-- 4. x-icon: vux ships no XIcon component (only metas.yml), so the tag has
         to be replaced with inline SVG at build time - in this file too. -->
    <p>
      <x-icon type="ios-arrow-up" size="20"></x-icon>
      静态 type 会被内联为 SVG；<x-icon :type="dynamicIcon"></x-icon> 保留原样。
    </p>
  </div>
</template>

<script>
// Every name here is resolved to `vux/src/components/<kebab>/...` by the
// auto-import transform; none of them are registered globally.
import {
  Actionsheet,
  Box,
  ButtonTab,
  ButtonTabItem,
  Divider,
  Group,
  XButton,
  XInput,
  XSwitch,
} from "vux";

export default {
  name: "App",
  components: {
    Actionsheet,
    Box,
    ButtonTab,
    ButtonTabItem,
    Divider,
    Group,
    XButton,
    XInput,
    XSwitch,
  },
  data() {
    return {
      name: "",
      count: 0,
      tabIndex: 0,
      checked: true,
      showSheet: false,
      dynamicIcon: "close",
      menus: [{ label: "菜单一" }, { label: "菜单二" }],
    };
  },
};
</script>

<style lang="less">
/* Proves `css.preprocessorOptions.less.modifyVars` reached this file.
   Only the variables defined by the `less-theme` file are in scope here -
   vux's own defaults are not imported into user styles automatically. */
.theme-probe {
  color: @theme-color;
}
</style>
