设计细节要求：
1. 完全复刻移动端企业级后台的清爽风格（类似
Microsoft 365 移动端）。
2. 列表项高度要足够大（56px），方便手指触控。
3. 点击 Checkbox只选中不跳转；点击文字区域（中间部分）触发打开详情；点击最右侧的三个点（：） 触发操作菜单。
4. 注意底部边框（Divider）的极细线条效果，以及复选框的圆角和边框颜色。
5. 请自建 Mock 数据（例如：RC-2026-XYZ），并实现全选/单选的逻辑闭环。”

具体细节;

{
  "component": "RegisterCodeListView",
  "designSystem": "Minimalist Mobile Admin",
  "globalStyles": {
    "backgroundColor": "#FFFFFF",
    "fontFamily": "system-ui, -apple-system, sans-serif",
    "textColorPrimary": "#323130",
    "textColorSecondary": "#605E5C",
    "dividerColor": "#EDEBE9"
  },
  "layoutStructure": {
    "type": "List",
    "width": "100%",
    "itemSpacing": "0",
    "padding": "0 16px"
  },
  "components": {
    "listHeader": {
      "display": "flex",
      "alignItems": "center",
      "height": "48px",
      "borderBottom": "1px solid $dividerColor",
      "padding": "0 16px",
      "elements": [
        {
          "type": "Checkbox",
          "action": "selectAll",
          "size": "20px",
          "marginRight": "16px",
          "borderColor": "#8A8886",
          "borderRadius": "2px"
        },
        {
          "type": "Text",
          "content": "列名 (如: 注册码) ↑",
          "fontSize": "14px",
          "fontWeight": "400",
          "color": "$textColorSecondary",
          "flex": "1"
        }
      ]
    },
    "listItem": {
      "display": "flex",
      "alignItems": "center",
      "height": "56px",
      "borderBottom": "1px solid $dividerColor",
      "padding": "0 16px",
      "stateHover": { "backgroundColor": "#F3F2F1" },
      "elements": [
        {
          "type": "Checkbox",
          "action": "selectSingle",
          "size": "20px",
          "marginRight": "16px",
          "borderColor": "#8A8886",
          "borderRadius": "2px",
          "checkedColor": "#0078D4" 
        },
        {
          "type": "Text",
          "field": "registerCodeText",
          "fontSize": "16px",
          "fontWeight": "400",
          "color": "$textColorPrimary",
          "flex": "1",
          "overflow": "hidden",
          "textOverflow": "ellipsis",
          "whiteSpace": "nowrap",
          "action": "openDetails" 
        },
        {
          "type": "Icon",
          "description": "可选的状态图标 (如视频中出现的蓝色小放大镜/钥匙)",
          "size": "16px",
          "color": "#0078D4",
          "marginRight": "12px",
          "visible": "conditional"
        },
        {
          "type": "IconButton",
          "icon": "VerticalDots (⋮)",
          "action": "openActionMenu",
          "size": "24px",
          "color": "$textColorSecondary",
          "padding": "8px",
          "background": "transparent"
        }
      ]
    }
  },
  "interactions": {
    "rowClick": "Trigger 'openDetails' view for the specific register code.",
    "checkboxClick": "Toggle selection state. Does not trigger rowClick.",
    "moreOptionsClick": "Open a contextual popover menu for actions like Edit, Delete, Copy.",
    "selectAllClick": "Toggle selection state for all loaded items."
  }
}
