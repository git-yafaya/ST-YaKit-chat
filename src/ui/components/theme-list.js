/**
 * 主题清单：名字、对应 components/themes.css 里的 data-theme、插画图标
 * 顶部主题按钮按这个顺序轮换；设置页也用这份清单
 * 弹窗（酒馆页面）和面板（iframe）都会读它，所以挂在全局 YAKIT_THEMES 上
 */
globalThis.YAKIT_THEMES = [
  { id: 'tavern', label: '跟随ST', icon: '跟随ST' },
  { id: 'light', label: '浅色', icon: '浅色' },
  { id: 'dark', label: '深色', icon: '深色' },
  { id: 'fir', label: '冷杉与海盐', icon: '冷杉与海盐' },
  { id: 'fig', label: '暮色无花果', icon: '暮色无花果' },
  { id: 'olive', label: '橄榄岩与日光柠檬', icon: '橄榄岩与日光柠檬' },
  { id: 'orange', label: '暖橙晨曦', icon: '暖橙晨曦' },
  { id: 'miemie', label: '咩咩', icon: '咩咩' },
  { id: 'neon', label: '霓虹夜城', icon: '霓虹夜城' },
];
