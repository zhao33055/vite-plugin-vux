import Vue from "vue";
import VueI18n from "vue-i18n";

import App from "./App.vue";
// import router from "./router";
// import store from "./store";

// import { AlertPlugin } from "vux";

const messages = {
  loan: {
    marketingQrcode: {
      highestLoanAmount: "最高借款额度 (元)",
      howMuchYouCanLoan: "你能借多少",
      fingertipLoan: "指尖办贷",
      speedLoan: "极速放款",
      creditLoan: "信用贷款",
      noWarrantyRequired: "无需担保",
      shareTitle: "富民普惠邀您测算信用贷款额度啦！",
      shareDescription: "富民普惠邀您测算信用贷款额度啦！",
    },
  },
  guarantee: {
    marketingQrcode: {
      highestLoanAmount: "最高额度 (元)",
      howMuchYouCanLoan: "你的额度",
      fingertipLoan: "指尖申请",
      speedLoan: "银行放款",
      creditLoan: "贷款担保",
      noWarrantyRequired: "无需抵押",
      shareTitle: "富民普惠邀您测算额度啦！",
      shareDescription: "富民普惠邀您测算额度啦！",
    },
  },
};
const i18n = new VueI18n({
  locale: "loan",
  messages,
});

Vue.use(VueI18n);
// Vue.use(AlertPlugin);

Vue.config.productionTip = false;

new Vue({
  i18n,
  render: (h) => h(App),
}).$mount("#app");
