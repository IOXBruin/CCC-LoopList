import LoopListItem  from "./LoopListItem";

const EPSILON = 1e-4;1
export enum Movement{
    Horizontal,
    Vertical,
}


const {ccclass, property, menu, disallowMultiple} = cc._decorator;

@ccclass
@disallowMultiple()
@menu("UIExtension/LoopList")
export default class LoopList extends cc.Component {
    /// 移动方向
    @property( {type:cc.Enum(Movement), serializable: true})
    movement: Movement = Movement.Vertical;

    @property( cc.Float)
    protected cacheBoundary: number = 20

    @property( cc.Integer)
    protected frameCreateMax: number = 30

    @property( cc.Float)
    protected scrollSpeedMax: number = 10

    /// item 缓存池
    protected _itemPool: { [key:string]: LoopListItem[]} = null
    protected _templates: {[key:string]: LoopListItem} = {}
    protected _template: string = null /// 默认使用的prefab
    protected _itemCreator: ( view: LoopList, idx: number)=>LoopListItem = null
    protected _totalcount: number = 0
    /// current display item
    protected _items: LoopListItem[] = []
    /// max padding 区分回收边界和创建边界 避免padding 造成的重复创建和回收
    protected _maxPadding: number = 0

    /// 缓存边界 recycle & create item boundary
    protected leftBoundary: number = 0
    protected rightBoundary: number = 0
    protected topBoundary: number = 0
    protected bottomBoundary: number = 0
    /// 上下左右边界
    protected _leftBoundary: number   = 0
    protected _bottomBoundary: number = 0 
    protected _rightBoundary: number  = 0
    protected _topBoundary: number    = 0
    /// 标记item size 是否变化
    protected _itemSizeDirty: boolean = false
    /// 标记item 是否需要更新（创建或回收）
    protected _itemDirty: boolean = false
    /// 滑动移动时用到的控制变量 展示item 到idx
    protected animeIdx: number = 0
    protected bAnimeMoveing: boolean = false

    /// 视口
    @property( cc.ScrollView)
    protected scrollView: cc.ScrollView = null
    get content(): cc.Node { return this.scrollView.content}
    get viewPort():cc.Node { return this.content.parent}

    onLoad(){
        /// 只允许一个方向
        if( this.scrollView == null) {
            this.scrollView = this.getComponent( cc.ScrollView)
        }
        /// 重置scrollview 滚动属性
        this.scrollView.horizontal = this.movement == Movement.Horizontal
        this.scrollView.vertical = this.movement == Movement.Vertical
        this.scrollView.elastic = true /// 允许超出边界
        /// 重定向scrollview 函数
        this.scrollView._getHowMuchOutOfBoundary = this._getHowMuchOutOfBoundary.bind(this)
        this.scrollView._calculateBoundary = this._calculateBoundary.bind(this)
        this.scrollView._clampDelta = this._clampDelta.bind(this)
        if( this.content) {
            /// initialize content view
            let anch = this.scrollView.horizontal? cc.v2( 0, 0.5): cc.v2( 0.5, 1)
            this.content.setAnchorPoint( anch) 
            this.content.setPosition( cc.Vec2.ZERO)
        }
        /// initialize data
        this._calculateBoundary()
    }

    onEnable(){
        this.scrollView.node.on( "scrolling", this.onScrolling, this)
    }

    onDisable(){
        this.scrollView.node.off( "scrolling", this.onScrolling, this)
    }

    /// initialize total count, item creator
    initialize(creator:( view: LoopList, idx: number)=>LoopListItem, count: number = 0){
        this._totalcount = count || 0
        this._itemCreator = creator
        this._initializePool()
        this._updateListView() 
    }

    /// 设置当前item count 如果不是强制Reset
    /// 那么大于等于当前itemcout || 最后一项item不是 当前item 自动使用刷新方式不会修改当前item 的显示位置
    setItemCount( count: number, bReset: boolean = false) {
        let oldcount = this._totalcount
        this._totalcount = count
        if( bReset) { 
            this._recycleAllItems( true)
            this._updateListView()
        } else {
            /// 如果新的item count 大于 oldItemcount那么大于等于当前itemcout
            let lastItem = this._items.length > 0? this._items[ this._items.length-1]: null
            if( count >= oldcount || (lastItem != null && lastItem.itemIdx < (count -1))) {
                this.refreshItems()
            } else {
                this.showItem( count - 1)
            }
        }
    }
     
    /// 刷新当前所有item
    refreshItems() {
        if( this._totalcount > 0 && this._items.length > 0) {
            let fristItem   = this._items[0]
            let pos         = fristItem.node.position
            let itemIdx     = fristItem.itemIdx
            /// create top item
            this._recycleAllItems()
            let arg = this.movement == Movement.Horizontal? pos.x: pos.y
            this._updateListView( itemIdx, arg)
        } else {
            this._recycleAllItems( true)
            this._updateListView()
        }
    }

    showItem( idx: number, bAnime: boolean = false) {
        // 限定到 0 - （totalcount -1）范围内
        idx = Math.min( this._totalcount - 1, Math.max(0, idx)) 
        if( bAnime) {
            this.scrollView.stopAutoScroll()
            this.animeIdx = idx;
            this.bAnimeMoveing = true;
        } else {
            /// 回收所有items 从新创建top item
            switch( this.movement){
                case Movement.Horizontal:
                    this._showItemHor( idx)
                    break
                case Movement.Vertical:
                    this._showItemVer( idx)
                    break
            }
        }
    }

    /// 获取一个item 
    getNewItem( key: string = null): LoopListItem {
        key = key || this._template
        let pool = this._itemPool[key]
        let instance: LoopListItem = (pool && pool.length > 0)? pool.pop(): null
        if ( instance == null) {
            let prefab = this._templates[key]
            if( prefab != null) { 
                let node = cc.instantiate( prefab.node) 
                instance = node.getComponent( LoopListItem)
                instance.itemKey = key
            } else {
                console.error(`not found template: ${key}`)
            }
        }
        return instance
    }

    itemSizeChanged() {
        this._itemSizeDirty = true
    }

    onScrolling() {
        this._itemDirty = true
        this.bAnimeMoveing = false
    }

    update( dt: number) {
        /// 动画移动
        this.bAnimeMoveing = this._scrolling? false: this.bAnimeMoveing
        switch( this.movement){
            case Movement.Horizontal:
                this._itemSizeDirty && this._updateHorizontalItems() /// check item size dirty
                this.bAnimeMoveing && this._scrollToItemHor( this.animeIdx) /// check auto moveing
                break
            case Movement.Vertical:
                this._itemSizeDirty && this._updateVerticalItems()
                this.bAnimeMoveing && this._scrollToItemVer( this.animeIdx)
                break
        }
        this._itemSizeDirty = false
        /// create || recycle item
        if( this._itemDirty) {
            this._itemDirty = false
            this._updateListView()
        }
    }

    protected _initializePool() {
        if( this._itemPool == null) {
            this._itemPool = {}
            let prefabs = this.content.getComponentsInChildren( LoopListItem)
            prefabs.forEach( item=>{
                /// save templates 
                let key = item.itemKey = item.node.name
                this._template          = this._template == null? key: this._template
                this._templates[key]    = item
                this._maxPadding        = Math.max( this._maxPadding, item.padding+2)
                this._recycle( item)
            })
        }
    }

    protected setContentPosition( pos: cc.Vec2){
        this.scrollView.stopAutoScroll()
        if( this.scrollView.content) {
            this.scrollView.content.position = pos
        }
    }

    protected _showItemVer( idx: number) {
        /// 判断需要现实的item和最后一个都在窗口内就不用执行了
        if( this._items.length > 0) {
            let frist = this._getItemAt( idx)
            let last = this._items[this._items.length -1]
            if( frist!= null && last.itemIdx === (this._totalcount-1) &&
                    this._getItemTop( frist) <= this._topBoundary &&
                        this._getItemBottom( last) >= this._bottomBoundary){
                return
            }
        }
        /// 回收当前所有item & reset content position
        this._recycleAllItems( true)
        if( this._updateListView( idx)){
            /// 判断最后一条是否在窗口内部需要靠窗口底部
            let item = this._items[ this._items.length -1]
            if( item.itemIdx === (this._totalcount - 1)){
                let bottom = this._getItemBottom( item)
                if( bottom > this._bottomBoundary) {
                    this.content.y = this._bottomBoundary - bottom
                    /// 移动窗口后需要重新加载顶部item &
                    /// 判断 topitem 是否在顶部边界里面去了
                    if( this._updateListView()){
                        let titem = this._items[0]
                        if( titem.itemIdx === 0) {
                            let top = this._getItemTop( titem)
                            if( top < this._topBoundary) {
                                this.content.y = this.content.y + (this._topBoundary - top)
                            }
                        }
                    }
                    /// 标记item 需要重新创建回收
                    this._itemDirty = true
                }
            }
        }
    }

    protected _showItemHor( idx: number){
        /// 判断需要显示的item和最后一个都在窗口内就不用执行了
        if( this._items.length > 0) {
            let frist = this._getItemAt( idx)
            let last = this._items[this._items.length -1]
            if( frist!= null && last.itemIdx === (this._totalcount-1) &&
                    this._getItemLeft( frist) >= this._leftBoundary &&
                        this._getItemRight( last) <= this._rightBoundary){
                return
            }
        }
        /// 回收当前所有item & reset content position
        this._recycleAllItems( true)
        if( this._updateListView( idx)) {
            /// 判断最后一条是否在窗口内部需要靠窗口右边
            let item = this._items[ this._items.length -1]
            if( item.itemIdx === (this._totalcount - 1)){
                let right = this._getItemRight( item)
                if( right < this._rightBoundary) {
                    this.content.x = this._rightBoundary - right
                    /// 判断 leftitem 是否在左边界边界里面去了
                    if( this._updateListView()){
                        let titem = this._items[0]
                        if( titem.itemIdx === 0) {
                            let left = this._getItemLeft( titem)
                            if( left > this._leftBoundary) {
                                this.content.x = this.content.x - (left - this._leftBoundary)
                            }
                        }
                    }
                    /// 标记item 需要重新创建回收
                    this._itemDirty = true
                }
            }
        }
    }

    protected _scrollToItemHor( idx: number) {
        let item = this._getItemAt( idx)
        let offset = 0
        if( item == null) {
            offset = this._items[0].itemIdx > idx? this.scrollSpeedMax: -this.scrollSpeedMax
        } else {
            offset = this._leftBoundary - this._getItemLeft( item)
            if( idx === (this._totalcount - 1)) {
                offset = this._rightBoundary - this._getItemRight( item)
                offset = offset >= 0? 0: offset
            } else {
                let last = this._items[ this._items.length - 1]
                if( last.itemIdx === (this._totalcount - 1) && 
                    this._getItemRight( last) <= this._rightBoundary)  {
                    offset = 0
                }
            }
        }
        /// 判断是否为0
        this.bAnimeMoveing = Math.abs( offset) > EPSILON
        if( offset > this.scrollSpeedMax || offset < -this.scrollSpeedMax) {
            offset = Math.min( this.scrollSpeedMax, Math.max( -this.scrollSpeedMax, offset))
        } else {
            /// 做个线性插值更平滑
        }
        if( offset !== 0) {
            this._itemDirty = true
            this.scrollView._moveContent( cc.v2( offset, 0), true)
        } else {
            this.scrollView.stopAutoScroll()
        }
    }

    protected _scrollToItemVer( idx: number){
        let item = this._getItemAt( idx)
        let offset = 0
        if( item == null) {
            offset = this._items[0].itemIdx > idx? -this.scrollSpeedMax: this.scrollSpeedMax
        } else {
            offset = this._topBoundary - this._getItemTop( item)
            if( idx === (this._totalcount - 1)) {
                offset = this._bottomBoundary - this._getItemBottom( item) 
                offset = offset <= 0? 0: offset
            } else {
                let last = this._items[ this._items.length - 1]
                if( last.itemIdx === (this._totalcount - 1) && 
                    this._getItemBottom( last) <= this._rightBoundary)  {
                    offset = 0
                } 
            }
        }
        /// 判断是否为0
        this.bAnimeMoveing = Math.abs( offset) > EPSILON
        if( offset > this.scrollSpeedMax || offset < -this.scrollSpeedMax) {
            offset = Math.min( this.scrollSpeedMax, Math.max( -this.scrollSpeedMax, offset))
        } else {
            /// 做个线性插值更平滑
        }
        if( offset !== 0) {
            this._itemDirty = true
            this.scrollView._moveContent( cc.v2( 0, offset), true)
        } else {
            this.scrollView.stopAutoScroll()
        }
    }

    protected _recycle(item: LoopListItem) {
        let pool = this._itemPool[item.itemKey]
        if( pool == null) { pool = this._itemPool[item.itemKey] = [] }
        item.node.active = false
        item.looplist = null
        pool.push( item)
    }
    
    protected _recycleAllItems( reset:boolean = false){
        this._items.forEach( item => {
            this._recycle( item)
        });
        this._items = []
        this.scrollView.stopAutoScroll()
        reset && this.setContentPosition( cc.Vec2.ZERO)
    }

    protected _createNewItem( idx: number): LoopListItem {
        if( idx < 0 || idx >= this._totalcount) return null 
        let item = this._itemCreator? this._itemCreator( this, idx) : null
        if( item != null) {
            item.node.position = cc.Vec2.ZERO; item.itemIdx = idx; 
            item.node.active = true;
            item.looplist = this; 
            item.node.parent = this.content
        }
        return item
    }

    protected _getItemAt( idx: number): LoopListItem{
        for( let i=0; i<this._items.length; i++) {
            let item = this._items[i] 
            if( item.itemIdx == idx) {
                return item
            }
        }
        return null
    }

    protected _getItemTop( item: LoopListItem): number {
        return item.node.y + this.content.y
    }

    protected _getItemBottom( item: LoopListItem): number {
        let itemtop = this._getItemTop( item)
        return itemtop - item.node.height 
    }

    protected _getItemLeft( item: LoopListItem): number {
        return item.node.x + this.content.x // + item.offset
    }

    protected _getItemRight( item: LoopListItem): number {
        let itemLeft = this._getItemLeft( item)
        return itemLeft + item.node.width
    }

    protected _updateListView( idx: number = 0, pos: number = null) {
        /// cur count
        let checkcount = 0
        let create = this.movement === Movement.Horizontal? this._updateHorizontal: this._updateVertical
        while( create.call( this, idx, pos)) {
            if( ++checkcount >= this.frameCreateMax) {
                this._itemDirty = true
            }
        }
        return true
    }

    protected _createTopItem( idx: number, y: number = null): LoopListItem {
        let item = this._createNewItem( idx)
        if( item) {
            if( y == null) {
                item.node.y = -this._getItemTop( item) + this._topBoundary - item.offset
            } else {
                item.node.y = y
            }
            this._items.push( item)
        }
        return item
    }

    /// 从新排序items
    protected _updateVerticalItems() {
        if( this._items.length > 1) {
            let pitem = this._items[0]
            for( let idx=1; idx < this._items.length; idx++){
                let item = this._items[idx]
                item.node.y = pitem.node.y - pitem.node.height - item.padding
                pitem = item
            }
        }
    }

    protected _updateVertical( idx: number, pos: number) : boolean {
        let curCount = this._items.length
        /// recycle all items
        if( this._totalcount == 0 ) {
            curCount > 0 && this._recycleAllItems( true)
            return false
        }
        /// fill up & fill down
        if( curCount === 0) {
            let item = this._createTopItem( idx, pos)
            return item != null
        }
        /// recycle top item 回收顶部数据 如果最底下的item 是最后一条那么不回收上面的item
        let topitem = this._items[0]
        let bottomitem = this._items[ curCount-1]
        let bottom_bottom = this._getItemBottom( bottomitem)
        if( curCount > 1) {
            /// recycle top item
            let canRecycleTop = (bottomitem.itemIdx !== this._totalcount-1 || bottom_bottom < this._bottomBoundary)
            if( canRecycleTop && this._getItemBottom( topitem) > (this.topBoundary + this._maxPadding)) {
                this._items.splice( 0, 1)
                this._recycle( topitem)
                return true
            } 
            /// recycle bottom item
            if( topitem.itemIdx > 0 && this._getItemTop( bottomitem) < (this.bottomBoundary - this._maxPadding)) { 
                this._items.splice( curCount-1, 1)
                this._recycle( bottomitem)
                return true
            }
        }
        /// create top item
        if( this._getItemTop( topitem) < this.topBoundary) {
            let item = this._createNewItem( topitem.itemIdx - 1)
            if( item) {
                item.node.y = topitem.node.y + item.padding + item.node.height
                this._items.splice( 0, 0, item)
                return true
            }
        }
        /// create bottom item
        if( bottom_bottom > this.bottomBoundary) {
            let item = this._createNewItem( bottomitem.itemIdx + 1)
            if( item) {
                item.node.y = bottomitem.node.y - bottomitem.node.height - bottomitem.padding
                this._items.push( item)
                return true
            }
        }
        return false
    }

    protected _createLeftItem( idx: number, x:number = null) : LoopListItem{
        let item = this._createNewItem( idx)
        if( item) {
            if( x == null) {
                item.node.x = -this._getItemLeft( item) + this._leftBoundary + item.offset
            } else {
                item.node.x = x
            }
            this._items.push( item)
        }
        return item
    }

    protected _updateHorizontalItems(){
        if( this._items.length > 1) {
            let preitem = this._items[0]
            for( let idx=1; idx < this._items.length; idx++){
                let item = this._items[idx]
                item.node.x = preitem.node.x + preitem.node.height + item.padding
                preitem = item
            }
        }
    }

    protected _updateHorizontal( idx: number, pos: number): boolean{
        let curCount = this._items.length
        /// recycle all items
        if( this._totalcount == 0) {
            curCount > 0 && this._recycleAllItems( true)
            return false
        }
        /// fill up & fill down
        if( curCount == 0) {
            let item = this._createLeftItem( idx, pos)
            return item != null? true: false
        }
        /// fill left & fill right
        let leftItem = this._items[0]
        let rightItem = this._items[ curCount-1]
        let right_right = this._getItemRight( rightItem)
        if( curCount > 1) {
            /// recycle left item
            let canRecycleLeft = (rightItem.itemIdx !== (this._totalcount - 1) || right_right > this.rightBoundary)
            if( canRecycleLeft && this._getItemRight( leftItem) < (this.leftBoundary - this._maxPadding)) {
                this._items.splice( 0, 1)
                this._recycle( leftItem)
                return true
            }
            /// recycle right item
            if( leftItem.itemIdx > 0 && this._getItemLeft(rightItem) > (this.rightBoundary + this._maxPadding)) {
                this._items.splice( curCount-1, 1)
                this._recycle( rightItem)
                return true
            }
        }
        /// create left item
        if( this._getItemLeft( leftItem) > this.leftBoundary) {
            let item = this._createNewItem( leftItem.itemIdx - 1)
            if( item) {
                item.node.x = leftItem.node.x - item.node.width - item.padding 
                this._items.splice( 0, 0, item)
                return true
            }
        }
        /// create bottom item
        if( right_right < this.rightBoundary) {
            let item = this._createNewItem( rightItem.itemIdx + 1)
            if( item) {
                item.node.x = rightItem.node.x + rightItem.node.width + rightItem.padding
                this._items.push( item)
                return true
            }
        }
        return false
    }

    /// 计算边界 下面的函数都是重写scrollview 原有的函数
    _calculateBoundary(){
        if (this.content) {
            this.content.setContentSize( cc.size( this.viewPort.width, this.viewPort.height))
            /// view port
            let viewSize = this.viewPort.getContentSize();
            let anchorX = viewSize.width * this.viewPort.anchorX;
            let anchorY = viewSize.height * this.viewPort.anchorY;
            /// 计算上下左右窗口边界
            this._leftBoundary  = -anchorX;
            this._bottomBoundary = -anchorY;
            this._rightBoundary = this._leftBoundary + viewSize.width;
            this._topBoundary   = this._bottomBoundary + viewSize.height;
            /// 计算上下左右 回收|创建 边界
            this.leftBoundary   = this._leftBoundary - this.cacheBoundary
            this.rightBoundary  = this._rightBoundary + this.cacheBoundary
            this.topBoundary    = this._topBoundary + this.cacheBoundary
            this.bottomBoundary = this._bottomBoundary - this.cacheBoundary

            // console.log( "boundary:", this._topBoundary, this._bottomBoundary)
        }
    }

    /// 裁剪移动量
    _clampDelta (delta: cc.Vec2) {
        return this._items.length > 0? delta: cc.Vec2.ZERO;
    }

    /// 重写该函数实现左边界回弹 
    /// pageView 也可以在这里实现 & 通过判断当前正在viewport 的第一个item 然后返回该item 的与LeftBounddary的关系
    _getContentLeftBoundary (){
        if( this._items.length > 0) {
            let item = this._items[0]
            if( item.itemIdx === 0) {
                return this._getItemLeft( item) - item.offset
            }
        }
        return this._leftBoundary
    }

    /// 重写该函数实现右边界回弹
    _getContentRightBoundary (){
        if( this._items.length > 0) {
            let item = this._items[this._items.length-1]
            if( item.itemIdx === (this._totalcount -1)) {
                return this._getItemRight( item)
            }
        }
        return this._rightBoundary
    }

    /// 重写该函数实现上边界回弹
    /// pageView 也可以在这里实现 & 通过判断当前正在viewport 的第一个item 然后返回该item 的与LeftBounddary的关系
    _getContentTopBoundary () {
        if( this._items.length > 0) {
            let item = this._items[0]
            if( item.itemIdx === 0) {
                return this._getItemTop( item) + item.offset
            }
        }
        return this._topBoundary
    }

    /// 重写该函数实现下边界回弹
    _getContentBottomBoundary () {
        if( this._items.length > 0) {
            let item = this._items[this._items.length-1]
            if ( item.itemIdx === (this._totalcount - 1)) {
                return this._getItemBottom( item)
            }
        }
        return this._bottomBoundary
    }

    // 重写该函数实现边界回弹
    _getHowMuchOutOfBoundary (addition: cc.Vec2){
        addition = addition || cc.v2(0, 0);
        // 注释这行会造成回弹bug
        if (addition.fuzzyEquals(cc.v2(0, 0), EPSILON) && !this._outOfBoundaryAmountDirty) {
            return this._outOfBoundaryAmount;
        }
        let outOfBoundaryAmount = cc.v2(0, 0);
        switch( this.movement) {
            case Movement.Horizontal: {
                /// 水平模式左右边界
                outOfBoundaryAmount.y = 0
                let left = this._getContentLeftBoundary() + addition.x
                let right = this._getContentRightBoundary() + addition.x
                if( left > this._leftBoundary) {
                    outOfBoundaryAmount.x = this._leftBoundary - left
                } else if( right < this._rightBoundary) {
                    outOfBoundaryAmount.x = this._rightBoundary - right;
                    let temp = left + outOfBoundaryAmount.x
                    if( this._items.length > 0 && this._items[0].itemIdx === 0 && temp >= this._leftBoundary) {
                        outOfBoundaryAmount.x = this._leftBoundary - left
                    }
                }
                break
            }
            case Movement.Vertical:{
                ///  垂直模式上下边界
                outOfBoundaryAmount.x = 0
                let top = this._getContentTopBoundary() + addition.y
                let bottom = this._getContentBottomBoundary() + addition.y
                if ( top < this._topBoundary) {
                    outOfBoundaryAmount.y = this._topBoundary - top
                } else if (bottom > this._bottomBoundary) {
                    outOfBoundaryAmount.y = this._bottomBoundary - bottom;
                    /// 判断第一条item 落下来是否会超过 topboundary 如果超过要重新计算
                    let temp = top + outOfBoundaryAmount.y
                    if( this._items.length > 0 && this._items[0].itemIdx === 0 && temp <= this._topBoundary) {
                        outOfBoundaryAmount.y = this._topBoundary - top
                    }
                }
                break
            }
        }
        /// ？？？
        if (addition.fuzzyEquals(cc.v2(0, 0), EPSILON)) {
            this._outOfBoundaryAmount = outOfBoundaryAmount;
            this._outOfBoundaryAmountDirty = false;
        }
        outOfBoundaryAmount = this._clampDelta(outOfBoundaryAmount);
        return outOfBoundaryAmount;
    }
    
    /// 获取scrollview 的私有属性
    get _outOfBoundaryAmount(): cc.Vec2{
        return this.scrollView._outOfBoundaryAmount
    }

    set _outOfBoundaryAmount(value: cc.Vec2){
        this.scrollView._outOfBoundaryAmount = value
    }

    get _outOfBoundaryAmountDirty(): boolean{
        return this.scrollView._outOfBoundaryAmountDirty
    }

    set _outOfBoundaryAmountDirty( value: boolean) {
        this.scrollView._outOfBoundaryAmountDirty = value
    }

    get _scrolling(){
        return this.scrollView._scrolling
    }
}

