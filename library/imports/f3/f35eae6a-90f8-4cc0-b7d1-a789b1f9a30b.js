"use strict";
cc._RF.push(module, 'f35ea5qkPhMwLfRp4mx+aML', 'LoopList');
// looplist/LoopList.ts

Object.defineProperty(exports, "__esModule", { value: true });
var LoopListItem_1 = require("./LoopListItem");
var EPSILON = 1e-4;
1;
var Movement;
(function (Movement) {
    Movement[Movement["Horizontal"] = 0] = "Horizontal";
    Movement[Movement["Vertical"] = 1] = "Vertical";
})(Movement = exports.Movement || (exports.Movement = {}));
var _a = cc._decorator, ccclass = _a.ccclass, property = _a.property, menu = _a.menu, disallowMultiple = _a.disallowMultiple;
var LoopList = /** @class */ (function (_super) {
    __extends(LoopList, _super);
    function LoopList() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        /// 移动方向
        _this.movement = Movement.Vertical;
        _this.cacheBoundary = 20;
        _this.frameCreateMax = 30;
        _this.scrollSpeedMax = 10;
        /// item 缓存池
        _this._itemPool = null;
        _this._templates = {};
        _this._template = null; /// 默认使用的prefab
        _this._itemCreator = null;
        _this._totalcount = 0;
        /// current display item
        _this._items = [];
        /// max padding 区分回收边界和创建边界 避免padding 造成的重复创建和回收
        _this._maxPadding = 0;
        /// 缓存边界 recycle & create item boundary
        _this.leftBoundary = 0;
        _this.rightBoundary = 0;
        _this.topBoundary = 0;
        _this.bottomBoundary = 0;
        /// 上下左右边界
        _this._leftBoundary = 0;
        _this._bottomBoundary = 0;
        _this._rightBoundary = 0;
        _this._topBoundary = 0;
        /// 标记item size 是否变化
        _this._itemSizeDirty = false;
        /// 标记item 是否需要更新（创建或回收）
        _this._itemDirty = false;
        /// 滑动移动时用到的控制变量 展示item 到idx
        _this.animeIdx = 0;
        _this.bAnimeMoveing = false;
        /// 视口
        _this.scrollView = null;
        return _this;
    }
    Object.defineProperty(LoopList.prototype, "content", {
        get: function () { return this.scrollView.content; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(LoopList.prototype, "viewPort", {
        get: function () { return this.content.parent; },
        enumerable: true,
        configurable: true
    });
    LoopList.prototype.onLoad = function () {
        /// 只允许一个方向
        if (this.scrollView == null) {
            this.scrollView = this.getComponent(cc.ScrollView);
        }
        /// 重置scrollview 滚动属性
        this.scrollView.horizontal = this.movement == Movement.Horizontal;
        this.scrollView.vertical = this.movement == Movement.Vertical;
        this.scrollView.elastic = true; /// 允许超出边界
        /// 重定向scrollview 函数
        this.scrollView._getHowMuchOutOfBoundary = this._getHowMuchOutOfBoundary.bind(this);
        this.scrollView._calculateBoundary = this._calculateBoundary.bind(this);
        this.scrollView._clampDelta = this._clampDelta.bind(this);
        if (this.content) {
            /// initialize content view
            var anch = this.scrollView.horizontal ? cc.v2(0, 0.5) : cc.v2(0.5, 1);
            this.content.setAnchorPoint(anch);
            this.content.setPosition(cc.Vec2.ZERO);
        }
        /// initialize data
        this._calculateBoundary();
    };
    LoopList.prototype.onEnable = function () {
        this.scrollView.node.on("scrolling", this.onScrolling, this);
    };
    LoopList.prototype.onDisable = function () {
        this.scrollView.node.off("scrolling", this.onScrolling, this);
    };
    /// initialize total count, item creator
    LoopList.prototype.initialize = function (creator, count) {
        if (count === void 0) { count = 0; }
        this._totalcount = count || 0;
        this._itemCreator = creator;
        this._initializePool();
        this._updateListView();
    };
    /// 设置当前item count 如果不是强制Reset
    /// 那么大于等于当前itemcout || 最后一项item不是 当前item 自动使用刷新方式不会修改当前item 的显示位置
    LoopList.prototype.setItemCount = function (count, bReset) {
        if (bReset === void 0) { bReset = false; }
        var oldcount = this._totalcount;
        this._totalcount = count;
        if (bReset) {
            this._recycleAllItems(true);
            this._updateListView();
        }
        else {
            /// 如果新的item count 大于 oldItemcount那么大于等于当前itemcout
            var lastItem = this._items.length > 0 ? this._items[this._items.length - 1] : null;
            if (count >= oldcount || (lastItem != null && lastItem.itemIdx < (count - 1))) {
                this.refreshItems();
            }
            else {
                this.showItem(count - 1);
            }
        }
    };
    /// 刷新当前所有item
    LoopList.prototype.refreshItems = function () {
        if (this._totalcount > 0 && this._items.length > 0) {
            var fristItem = this._items[0];
            var pos = fristItem.node.position;
            var itemIdx = fristItem.itemIdx;
            /// create top item
            this._recycleAllItems();
            var arg = this.movement == Movement.Horizontal ? pos.x : pos.y;
            this._updateListView(itemIdx, arg);
        }
        else {
            this._recycleAllItems(true);
            this._updateListView();
        }
    };
    LoopList.prototype.showItem = function (idx, bAnime) {
        if (bAnime === void 0) { bAnime = false; }
        // 限定到 0 - （totalcount -1）范围内
        idx = Math.min(this._totalcount - 1, Math.max(0, idx));
        if (bAnime) {
            this.scrollView.stopAutoScroll();
            this.animeIdx = idx;
            this.bAnimeMoveing = true;
        }
        else {
            /// 回收所有items 从新创建top item
            switch (this.movement) {
                case Movement.Horizontal:
                    this._showItemHor(idx);
                    break;
                case Movement.Vertical:
                    this._showItemVer(idx);
                    break;
            }
        }
    };
    /// 获取一个item 
    LoopList.prototype.getNewItem = function (key) {
        if (key === void 0) { key = null; }
        key = key || this._template;
        var pool = this._itemPool[key];
        var instance = (pool && pool.length > 0) ? pool.pop() : null;
        if (instance == null) {
            var prefab = this._templates[key];
            if (prefab != null) {
                var node = cc.instantiate(prefab.node);
                instance = node.getComponent(LoopListItem_1.default);
                instance.itemKey = key;
            }
            else {
                console.error("not found template: " + key);
            }
        }
        return instance;
    };
    LoopList.prototype.itemSizeChanged = function () {
        this._itemSizeDirty = true;
    };
    LoopList.prototype.onScrolling = function () {
        this._itemDirty = true;
        this.bAnimeMoveing = false;
    };
    LoopList.prototype.update = function (dt) {
        /// 动画移动
        this.bAnimeMoveing = this._scrolling ? false : this.bAnimeMoveing;
        switch (this.movement) {
            case Movement.Horizontal:
                this._itemSizeDirty && this._updateHorizontalItems(); /// check item size dirty
                this.bAnimeMoveing && this._scrollToItemHor(this.animeIdx); /// check auto moveing
                break;
            case Movement.Vertical:
                this._itemSizeDirty && this._updateVerticalItems();
                this.bAnimeMoveing && this._scrollToItemVer(this.animeIdx);
                break;
        }
        this._itemSizeDirty = false;
        /// create || recycle item
        if (this._itemDirty) {
            this._itemDirty = false;
            this._updateListView();
        }
    };
    LoopList.prototype._initializePool = function () {
        var _this = this;
        if (this._itemPool == null) {
            this._itemPool = {};
            var prefabs = this.content.getComponentsInChildren(LoopListItem_1.default);
            prefabs.forEach(function (item) {
                /// save templates 
                var key = item.itemKey = item.node.name;
                _this._template = _this._template == null ? key : _this._template;
                _this._templates[key] = item;
                _this._maxPadding = Math.max(_this._maxPadding, item.padding + 2);
                _this._recycle(item);
            });
        }
    };
    LoopList.prototype.setContentPosition = function (pos) {
        this.scrollView.stopAutoScroll();
        if (this.scrollView.content) {
            this.scrollView.content.position = pos;
        }
    };
    LoopList.prototype._showItemVer = function (idx) {
        /// 判断需要现实的item和最后一个都在窗口内就不用执行了
        if (this._items.length > 0) {
            var frist = this._getItemAt(idx);
            var last = this._items[this._items.length - 1];
            if (frist != null && last.itemIdx === (this._totalcount - 1) &&
                this._getItemTop(frist) <= this._topBoundary &&
                this._getItemBottom(last) >= this._bottomBoundary) {
                return;
            }
        }
        /// 回收当前所有item & reset content position
        this._recycleAllItems(true);
        if (this._updateListView(idx)) {
            /// 判断最后一条是否在窗口内部需要靠窗口底部
            var item = this._items[this._items.length - 1];
            if (item.itemIdx === (this._totalcount - 1)) {
                var bottom = this._getItemBottom(item);
                if (bottom > this._bottomBoundary) {
                    this.content.y = this._bottomBoundary - bottom;
                    /// 移动窗口后需要重新加载顶部item &
                    /// 判断 topitem 是否在顶部边界里面去了
                    if (this._updateListView()) {
                        var titem = this._items[0];
                        if (titem.itemIdx === 0) {
                            var top = this._getItemTop(titem);
                            if (top < this._topBoundary) {
                                this.content.y = this.content.y + (this._topBoundary - top);
                            }
                        }
                    }
                    /// 标记item 需要重新创建回收
                    this._itemDirty = true;
                }
            }
        }
    };
    LoopList.prototype._showItemHor = function (idx) {
        /// 判断需要显示的item和最后一个都在窗口内就不用执行了
        if (this._items.length > 0) {
            var frist = this._getItemAt(idx);
            var last = this._items[this._items.length - 1];
            if (frist != null && last.itemIdx === (this._totalcount - 1) &&
                this._getItemLeft(frist) >= this._leftBoundary &&
                this._getItemRight(last) <= this._rightBoundary) {
                return;
            }
        }
        /// 回收当前所有item & reset content position
        this._recycleAllItems(true);
        if (this._updateListView(idx)) {
            /// 判断最后一条是否在窗口内部需要靠窗口右边
            var item = this._items[this._items.length - 1];
            if (item.itemIdx === (this._totalcount - 1)) {
                var right = this._getItemRight(item);
                if (right < this._rightBoundary) {
                    this.content.x = this._rightBoundary - right;
                    /// 判断 leftitem 是否在左边界边界里面去了
                    if (this._updateListView()) {
                        var titem = this._items[0];
                        if (titem.itemIdx === 0) {
                            var left = this._getItemLeft(titem);
                            if (left > this._leftBoundary) {
                                this.content.x = this.content.x - (left - this._leftBoundary);
                            }
                        }
                    }
                    /// 标记item 需要重新创建回收
                    this._itemDirty = true;
                }
            }
        }
    };
    LoopList.prototype._scrollToItemHor = function (idx) {
        var item = this._getItemAt(idx);
        var offset = 0;
        if (item == null) {
            offset = this._items[0].itemIdx > idx ? this.scrollSpeedMax : -this.scrollSpeedMax;
        }
        else {
            offset = this._leftBoundary - this._getItemLeft(item);
            if (idx === (this._totalcount - 1)) {
                offset = this._rightBoundary - this._getItemRight(item);
                offset = offset >= 0 ? 0 : offset;
            }
            else {
                var last = this._items[this._items.length - 1];
                if (last.itemIdx === (this._totalcount - 1) &&
                    this._getItemRight(last) <= this._rightBoundary) {
                    offset = 0;
                }
            }
        }
        /// 判断是否为0
        this.bAnimeMoveing = Math.abs(offset) > EPSILON;
        if (offset > this.scrollSpeedMax || offset < -this.scrollSpeedMax) {
            offset = Math.min(this.scrollSpeedMax, Math.max(-this.scrollSpeedMax, offset));
        }
        else {
            /// 做个线性插值更平滑
        }
        if (offset !== 0) {
            this._itemDirty = true;
            this.scrollView._moveContent(cc.v2(offset, 0), true);
        }
        else {
            this.scrollView.stopAutoScroll();
        }
    };
    LoopList.prototype._scrollToItemVer = function (idx) {
        var item = this._getItemAt(idx);
        var offset = 0;
        if (item == null) {
            offset = this._items[0].itemIdx > idx ? -this.scrollSpeedMax : this.scrollSpeedMax;
        }
        else {
            offset = this._topBoundary - this._getItemTop(item);
            if (idx === (this._totalcount - 1)) {
                offset = this._bottomBoundary - this._getItemBottom(item);
                offset = offset <= 0 ? 0 : offset;
            }
            else {
                var last = this._items[this._items.length - 1];
                if (last.itemIdx === (this._totalcount - 1) &&
                    this._getItemBottom(last) <= this._rightBoundary) {
                    offset = 0;
                }
            }
        }
        /// 判断是否为0
        this.bAnimeMoveing = Math.abs(offset) > EPSILON;
        if (offset > this.scrollSpeedMax || offset < -this.scrollSpeedMax) {
            offset = Math.min(this.scrollSpeedMax, Math.max(-this.scrollSpeedMax, offset));
        }
        else {
            /// 做个线性插值更平滑
        }
        if (offset !== 0) {
            this._itemDirty = true;
            this.scrollView._moveContent(cc.v2(0, offset), true);
        }
        else {
            this.scrollView.stopAutoScroll();
        }
    };
    LoopList.prototype._recycle = function (item) {
        var pool = this._itemPool[item.itemKey];
        if (pool == null) {
            pool = this._itemPool[item.itemKey] = [];
        }
        item.node.active = false;
        item.looplist = null;
        pool.push(item);
    };
    LoopList.prototype._recycleAllItems = function (reset) {
        var _this = this;
        if (reset === void 0) { reset = false; }
        this._items.forEach(function (item) {
            _this._recycle(item);
        });
        this._items = [];
        this.scrollView.stopAutoScroll();
        reset && this.setContentPosition(cc.Vec2.ZERO);
    };
    LoopList.prototype._createNewItem = function (idx) {
        if (idx < 0 || idx >= this._totalcount)
            return null;
        var item = this._itemCreator ? this._itemCreator(this, idx) : null;
        if (item != null) {
            item.node.position = cc.Vec2.ZERO;
            item.itemIdx = idx;
            item.node.active = true;
            item.looplist = this;
            item.node.parent = this.content;
        }
        return item;
    };
    LoopList.prototype._getItemAt = function (idx) {
        for (var i = 0; i < this._items.length; i++) {
            var item = this._items[i];
            if (item.itemIdx == idx) {
                return item;
            }
        }
        return null;
    };
    LoopList.prototype._getItemTop = function (item) {
        return item.node.y + this.content.y;
    };
    LoopList.prototype._getItemBottom = function (item) {
        var itemtop = this._getItemTop(item);
        return itemtop - item.node.height;
    };
    LoopList.prototype._getItemLeft = function (item) {
        return item.node.x + this.content.x; // + item.offset
    };
    LoopList.prototype._getItemRight = function (item) {
        var itemLeft = this._getItemLeft(item);
        return itemLeft + item.node.width;
    };
    LoopList.prototype._updateListView = function (idx, pos) {
        if (idx === void 0) { idx = 0; }
        if (pos === void 0) { pos = null; }
        /// cur count
        var checkcount = 0;
        var create = this.movement === Movement.Horizontal ? this._updateHorizontal : this._updateVertical;
        while (create.call(this, idx, pos)) {
            if (++checkcount >= this.frameCreateMax) {
                this._itemDirty = true;
            }
        }
        return true;
    };
    LoopList.prototype._createTopItem = function (idx, y) {
        if (y === void 0) { y = null; }
        var item = this._createNewItem(idx);
        if (item) {
            if (y == null) {
                item.node.y = -this._getItemTop(item) + this._topBoundary - item.offset;
            }
            else {
                item.node.y = y;
            }
            this._items.push(item);
        }
        return item;
    };
    /// 从新排序items
    LoopList.prototype._updateVerticalItems = function () {
        if (this._items.length > 1) {
            var pitem = this._items[0];
            for (var idx = 1; idx < this._items.length; idx++) {
                var item = this._items[idx];
                item.node.y = pitem.node.y - pitem.node.height - item.padding;
                pitem = item;
            }
        }
    };
    LoopList.prototype._updateVertical = function (idx, pos) {
        var curCount = this._items.length;
        /// recycle all items
        if (this._totalcount == 0) {
            curCount > 0 && this._recycleAllItems(true);
            return false;
        }
        /// fill up & fill down
        if (curCount === 0) {
            var item = this._createTopItem(idx, pos);
            return item != null;
        }
        /// recycle top item 回收顶部数据 如果最底下的item 是最后一条那么不回收上面的item
        var topitem = this._items[0];
        var bottomitem = this._items[curCount - 1];
        var bottom_bottom = this._getItemBottom(bottomitem);
        if (curCount > 1) {
            /// recycle top item
            var canRecycleTop = (bottomitem.itemIdx !== this._totalcount - 1 || bottom_bottom < this._bottomBoundary);
            if (canRecycleTop && this._getItemBottom(topitem) > (this.topBoundary + this._maxPadding)) {
                this._items.splice(0, 1);
                this._recycle(topitem);
                return true;
            }
            /// recycle bottom item
            if (topitem.itemIdx > 0 && this._getItemTop(bottomitem) < (this.bottomBoundary - this._maxPadding)) {
                this._items.splice(curCount - 1, 1);
                this._recycle(bottomitem);
                return true;
            }
        }
        /// create top item
        if (this._getItemTop(topitem) < this.topBoundary) {
            var item = this._createNewItem(topitem.itemIdx - 1);
            if (item) {
                item.node.y = topitem.node.y + item.padding + item.node.height;
                this._items.splice(0, 0, item);
                return true;
            }
        }
        /// create bottom item
        if (bottom_bottom > this.bottomBoundary) {
            var item = this._createNewItem(bottomitem.itemIdx + 1);
            if (item) {
                item.node.y = bottomitem.node.y - bottomitem.node.height - bottomitem.padding;
                this._items.push(item);
                return true;
            }
        }
        return false;
    };
    LoopList.prototype._createLeftItem = function (idx, x) {
        if (x === void 0) { x = null; }
        var item = this._createNewItem(idx);
        if (item) {
            if (x == null) {
                item.node.x = -this._getItemLeft(item) + this._leftBoundary + item.offset;
            }
            else {
                item.node.x = x;
            }
            this._items.push(item);
        }
        return item;
    };
    LoopList.prototype._updateHorizontalItems = function () {
        if (this._items.length > 1) {
            var preitem = this._items[0];
            for (var idx = 1; idx < this._items.length; idx++) {
                var item = this._items[idx];
                item.node.x = preitem.node.x + preitem.node.height + item.padding;
                preitem = item;
            }
        }
    };
    LoopList.prototype._updateHorizontal = function (idx, pos) {
        var curCount = this._items.length;
        /// recycle all items
        if (this._totalcount == 0) {
            curCount > 0 && this._recycleAllItems(true);
            return false;
        }
        /// fill up & fill down
        if (curCount == 0) {
            var item = this._createLeftItem(idx, pos);
            return item != null ? true : false;
        }
        /// fill left & fill right
        var leftItem = this._items[0];
        var rightItem = this._items[curCount - 1];
        var right_right = this._getItemRight(rightItem);
        if (curCount > 1) {
            /// recycle left item
            var canRecycleLeft = (rightItem.itemIdx !== (this._totalcount - 1) || right_right > this.rightBoundary);
            if (canRecycleLeft && this._getItemRight(leftItem) < (this.leftBoundary - this._maxPadding)) {
                this._items.splice(0, 1);
                this._recycle(leftItem);
                return true;
            }
            /// recycle right item
            if (leftItem.itemIdx > 0 && this._getItemLeft(rightItem) > (this.rightBoundary + this._maxPadding)) {
                this._items.splice(curCount - 1, 1);
                this._recycle(rightItem);
                return true;
            }
        }
        /// create left item
        if (this._getItemLeft(leftItem) > this.leftBoundary) {
            var item = this._createNewItem(leftItem.itemIdx - 1);
            if (item) {
                item.node.x = leftItem.node.x - item.node.width - item.padding;
                this._items.splice(0, 0, item);
                return true;
            }
        }
        /// create bottom item
        if (right_right < this.rightBoundary) {
            var item = this._createNewItem(rightItem.itemIdx + 1);
            if (item) {
                item.node.x = rightItem.node.x + rightItem.node.width + rightItem.padding;
                this._items.push(item);
                return true;
            }
        }
        return false;
    };
    /// 计算边界 下面的函数都是重写scrollview 原有的函数
    LoopList.prototype._calculateBoundary = function () {
        if (this.content) {
            this.content.setContentSize(cc.size(this.viewPort.width, this.viewPort.height));
            /// view port
            var viewSize = this.viewPort.getContentSize();
            var anchorX = viewSize.width * this.viewPort.anchorX;
            var anchorY = viewSize.height * this.viewPort.anchorY;
            /// 计算上下左右窗口边界
            this._leftBoundary = -anchorX;
            this._bottomBoundary = -anchorY;
            this._rightBoundary = this._leftBoundary + viewSize.width;
            this._topBoundary = this._bottomBoundary + viewSize.height;
            /// 计算上下左右 回收|创建 边界
            this.leftBoundary = this._leftBoundary - this.cacheBoundary;
            this.rightBoundary = this._rightBoundary + this.cacheBoundary;
            this.topBoundary = this._topBoundary + this.cacheBoundary;
            this.bottomBoundary = this._bottomBoundary - this.cacheBoundary;
            // console.log( "boundary:", this._topBoundary, this._bottomBoundary)
        }
    };
    /// 裁剪移动量
    LoopList.prototype._clampDelta = function (delta) {
        return this._items.length > 0 ? delta : cc.Vec2.ZERO;
    };
    /// 重写该函数实现左边界回弹 
    /// pageView 也可以在这里实现 & 通过判断当前正在viewport 的第一个item 然后返回该item 的与LeftBounddary的关系
    LoopList.prototype._getContentLeftBoundary = function () {
        if (this._items.length > 0) {
            var item = this._items[0];
            if (item.itemIdx === 0) {
                return this._getItemLeft(item) - item.offset;
            }
        }
        return this._leftBoundary;
    };
    /// 重写该函数实现右边界回弹
    LoopList.prototype._getContentRightBoundary = function () {
        if (this._items.length > 0) {
            var item = this._items[this._items.length - 1];
            if (item.itemIdx === (this._totalcount - 1)) {
                return this._getItemRight(item);
            }
        }
        return this._rightBoundary;
    };
    /// 重写该函数实现上边界回弹
    /// pageView 也可以在这里实现 & 通过判断当前正在viewport 的第一个item 然后返回该item 的与LeftBounddary的关系
    LoopList.prototype._getContentTopBoundary = function () {
        if (this._items.length > 0) {
            var item = this._items[0];
            if (item.itemIdx === 0) {
                return this._getItemTop(item) + item.offset;
            }
        }
        return this._topBoundary;
    };
    /// 重写该函数实现下边界回弹
    LoopList.prototype._getContentBottomBoundary = function () {
        if (this._items.length > 0) {
            var item = this._items[this._items.length - 1];
            if (item.itemIdx === (this._totalcount - 1)) {
                return this._getItemBottom(item);
            }
        }
        return this._bottomBoundary;
    };
    // 重写该函数实现边界回弹
    LoopList.prototype._getHowMuchOutOfBoundary = function (addition) {
        addition = addition || cc.v2(0, 0);
        // 注释这行会造成回弹bug
        if (addition.fuzzyEquals(cc.v2(0, 0), EPSILON) && !this._outOfBoundaryAmountDirty) {
            return this._outOfBoundaryAmount;
        }
        var outOfBoundaryAmount = cc.v2(0, 0);
        switch (this.movement) {
            case Movement.Horizontal: {
                /// 水平模式左右边界
                outOfBoundaryAmount.y = 0;
                var left = this._getContentLeftBoundary() + addition.x;
                var right = this._getContentRightBoundary() + addition.x;
                if (left > this._leftBoundary) {
                    outOfBoundaryAmount.x = this._leftBoundary - left;
                }
                else if (right < this._rightBoundary) {
                    outOfBoundaryAmount.x = this._rightBoundary - right;
                    var temp = left + outOfBoundaryAmount.x;
                    if (this._items.length > 0 && this._items[0].itemIdx === 0 && temp >= this._leftBoundary) {
                        outOfBoundaryAmount.x = this._leftBoundary - left;
                    }
                }
                break;
            }
            case Movement.Vertical: {
                ///  垂直模式上下边界
                outOfBoundaryAmount.x = 0;
                var top = this._getContentTopBoundary() + addition.y;
                var bottom = this._getContentBottomBoundary() + addition.y;
                if (top < this._topBoundary) {
                    outOfBoundaryAmount.y = this._topBoundary - top;
                }
                else if (bottom > this._bottomBoundary) {
                    outOfBoundaryAmount.y = this._bottomBoundary - bottom;
                    /// 判断第一条item 落下来是否会超过 topboundary 如果超过要重新计算
                    var temp = top + outOfBoundaryAmount.y;
                    if (this._items.length > 0 && this._items[0].itemIdx === 0 && temp <= this._topBoundary) {
                        outOfBoundaryAmount.y = this._topBoundary - top;
                    }
                }
                break;
            }
        }
        /// ？？？
        if (addition.fuzzyEquals(cc.v2(0, 0), EPSILON)) {
            this._outOfBoundaryAmount = outOfBoundaryAmount;
            this._outOfBoundaryAmountDirty = false;
        }
        outOfBoundaryAmount = this._clampDelta(outOfBoundaryAmount);
        return outOfBoundaryAmount;
    };
    Object.defineProperty(LoopList.prototype, "_outOfBoundaryAmount", {
        /// 获取scrollview 的私有属性
        get: function () {
            return this.scrollView._outOfBoundaryAmount;
        },
        set: function (value) {
            this.scrollView._outOfBoundaryAmount = value;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(LoopList.prototype, "_outOfBoundaryAmountDirty", {
        get: function () {
            return this.scrollView._outOfBoundaryAmountDirty;
        },
        set: function (value) {
            this.scrollView._outOfBoundaryAmountDirty = value;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(LoopList.prototype, "_scrolling", {
        get: function () {
            return this.scrollView._scrolling;
        },
        enumerable: true,
        configurable: true
    });
    __decorate([
        property({ type: cc.Enum(Movement), serializable: true })
    ], LoopList.prototype, "movement", void 0);
    __decorate([
        property(cc.Float)
    ], LoopList.prototype, "cacheBoundary", void 0);
    __decorate([
        property(cc.Integer)
    ], LoopList.prototype, "frameCreateMax", void 0);
    __decorate([
        property(cc.Float)
    ], LoopList.prototype, "scrollSpeedMax", void 0);
    __decorate([
        property(cc.ScrollView)
    ], LoopList.prototype, "scrollView", void 0);
    LoopList = __decorate([
        ccclass,
        disallowMultiple(),
        menu("UIExtension/LoopList")
    ], LoopList);
    return LoopList;
}(cc.Component));
exports.default = LoopList;

cc._RF.pop();