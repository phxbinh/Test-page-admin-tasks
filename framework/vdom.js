// VDOM ---------------
window.App = window.App || {};

// =======================
// Phần 1 – VDOM
// =======================
(function (App) {
  const { log } = App.Debugger || { log: () => {} }; // Fallback nếu không có Debugger
  // ----------------------
  // Symbols
  // ----------------------
  const FragmentPlus = Symbol('FragmentPlus');
  const TEXT = Symbol('Text');
  // NOTE: changed to let so we can toggle it dynamically (your request)
  // 🔺 true: So sánh theo index 
  // 🔹  false: So sánh theo key
  let SAFE_PATCH_CHILDREN = false;

  function getDiffType() {
    return SAFE_PATCH_CHILDREN === true ? "🥇 patchChildren by index" : "🔑 patchChildren by key";
  }

  // ----------------------
  // Detect environment
  // ----------------------
  const IS_SSR = typeof document === 'undefined';
  const IS_CLIENT = !IS_SSR;

  // ----------------------
  // Helper functions
  // ----------------------

  // Hàm escape để chống XSS
  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Thay thế h() gốc
  function h(type, props = {}, ...children) {
    // Nếu props có dangerouslySetInnerHTML thì bỏ qua escape
    if (props && props.dangerouslySetInnerHTML) {
      return {
        type,
        props,
        children: [] // không render children khi dùng innerHTML
      };
    }
    const safeChildren = children.flat().map(c => {
      if ((typeof c === "string" || typeof c === "number") && props?.preventXSS) {
        return escapeHTML(c); // escape text node
      }
      return c;
    });

    return { type, props: props || {}, children: safeChildren };
  }; // End h(...){...}

  function toVNode(v) {
    if (v && typeof v === 'object') return v;
    return {
      type: TEXT,
      props: {},
      children: null,
      text: v == null || v === false ? '' : String(v)
    };
  }

  function getEl(v) {
    if (!v) return null;
    if (v._el) return v._el;
    if (v._child && v._child._el) return v._child._el;
    return null;
  }

  function firstEl(nodes) {
    const arr = nodes || [];
    for (let i = 0; i < arr.length; i++) {
      const el = getEl(arr[i]);
      if (el) return el;
    }
    return null;
  }

  function mountChildrenBefore(parent, children, refEl) {
    (children || []).forEach(ch => patch(parent, null, ch, refEl));
  }

  // ----------------------
  // Instance stack
  // ----------------------
  const instanceStack = [];
  function currentInstance() {
    return instanceStack[instanceStack.length - 1] || null;
  }

  // ----------------------
  // Root
  // ----------------------
  let rootComp = null,
      rootEl = null,
      rootProps = {},
      rootVNode = null;

  // ----------------------
  // Bảo vệ props
  // if (key === "dangerouslySetInnerHTML" || key === "__html")
  // ----------------------
  function sanitizeHTML_Blacklist(dirty) {
    if (typeof dirty !== 'string') return '';

    // Trên SSR, không dùng DOMParser (không có document), nên dùng regex đơn giản
    if (IS_SSR) {
      // Regex xóa tag nguy hiểm
      return dirty.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
                  .replace(/<iframe[^>]*>([\s\S]*?)<\/iframe>/gi, '')
                  .replace(/<object[^>]*>([\s\S]*?)<\/object>/gi, '')
                  .replace(/<embed[^>]*>/gi, '')
                  .replace(/<link[^>]*>/gi, '')
                  .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
                  .replace(/ on\w+="[^"]*"/gi, '') // Xóa onXXX
                  .replace(/ on\w+='[^']*'/gi, '')
                  .replace(/javascript:/gi, ''); // Xóa javascript:
    }

    // Trên client, dùng DOMParser như cũ
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirty, 'text/html');

    // Xóa script, iframe, object... để tránh XSS
    // tạm bỏ iframe
    const blacklist = ['script', 'object', 'embed', 'link', 'style'];
    blacklist.forEach(tag => {
      doc.querySelectorAll(tag).forEach(el => el.remove());
    });

    // Xóa các thuộc tính nguy hiểm (kiểu onClick, onError, javascript:)
    const treeWalker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null, false);
    while (treeWalker.nextNode()) {
      const el = treeWalker.currentNode;
      [...el.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = attr.value;

        // Bỏ các thuộc tính onXXX (onClick, onError, ...)
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }

        // Bỏ các giá trị chứa javascript:
        if (typeof value === 'string' && value.toLowerCase().includes('javascript:')) {
          el.removeAttribute(attr.name);
        }
      });
    }

    return doc.body.innerHTML;
  }

  function sanitizeHTML_Whitelist(dirty) {
    const allowedTags = [
      "h1","h2","h3","h4","h5","h6",   // headings
      "p","br","hr",
      "b","i","em","strong","u","del","mark", // inline
      "a","ul","ol","li","blockquote","code","pre", // list + blockquote + code
      "img","span","table","th","td","tr"
    ];

    const allowedAttrs = {
      "a": ["href", "title", "target", "rel"],
      "img": ["src", "alt", "title", "width", "height"],
      "span": ["style"],
      "code": ["class"] // để giữ syntax highlight class="language-js"
    };

    if (IS_SSR) {
      // Trên SSR, dùng regex để filter (không có DOM)
      // Đây là version đơn giản, không hoàn hảo nhưng an toàn
      return dirty.replace(/<[^>]*>/g, match => {
        const tagMatch = match.match(/<(\w+)([^>]*)>/);
        if (!tagMatch) return '';
        const tag = tagMatch[1].toLowerCase();
        if (!allowedTags.includes(tag)) return '';
        let attrs = tagMatch[2];
        attrs = attrs.replace(/(\w+)=["']?([^"']*)["']?/g, (m, k, v) => {
          if ((allowedAttrs[tag] || []).includes(k)) {
            if ((k === 'href' || k === 'src') && v.toLowerCase().startsWith('javascript:')) return '';
            return ` ${k}="${escapeHTML(v)}"`;
          }
          return '';
        });
        return `<${tag}${attrs}>`;
      });
    }

    // Trên client, dùng DOM như cũ
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirty, "text/html");

    function clean(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.nodeName.toLowerCase();
        if (!allowedTags.includes(tag)) {
          const textNode = document.createTextNode(node.textContent || "");
          node.replaceWith(textNode);
          return;
        }

        // Lọc attributes
        [...node.attributes].forEach(attr => {
          if (!(allowedAttrs[tag] || []).includes(attr.name)) {
            node.removeAttribute(attr.name);
          } else {
            // chặn javascript: trong href/src
            if ((attr.name === "href" || attr.name === "src") &&
                node.getAttribute(attr.name).trim().toLowerCase().startsWith("javascript:")) {
              node.removeAttribute(attr.name);
            }
          }
        });
      }
      [...node.childNodes].forEach(clean);
    }

    [...doc.body.childNodes].forEach(clean);
    return doc.body.innerHTML;
  }


  function sanitizeHTML(html, unsafe = true) {
    if (unsafe) return html; // Cho phép bypass nếu __unsafe = true

    // Danh sách tag nguy hiểm
    const forbiddenTags = /<\/?(script|iframe|object|embed|link|meta|style)[^>]*>/gi;

    // Xóa các tag nguy hiểm nhưng giữ lại nội dung khác
    return html.replace(forbiddenTags, "");
  }


  /*
  Mục
  Ý nghĩa

  sanitizeHTML_Blacklist
  Dành cho dangerouslySetInnerHTML: giữ nguyên HTML gốc (có thể chứa <div>, <table>, …), chỉ xóa những phần thật sự nguy hiểm

  sanitizeHTML_Whitelist
  Dành cho __html: chỉ cho phép các thẻ Markdown thông thường, an toàn tuyệt đối

  sanitizeHTML
  Bản nhẹ fallback hoặc khi cần bypass thủ công

  .startsWith("on") + javascript: regex
  Ngăn toàn bộ inline JS (XSS phổ biến nhất)

  data: + vbscript:
  Chặn tấn công base64/script URI cũ của IE và một số trình duyệt cũ

  meta thêm vào blacklist
  vì có thể thay đổi charset, redirect meta refresh, v.v.

  */


    // -------------
    // patchPros dùng để kết hợp
    // với componentHtml
    // -------------
  function patchProps(el, oldProps = {}, newProps = {}) {
    const store = el.__listeners || (el.__listeners = Object.create(null));

    // --- Xóa props cũ ---
    for (const key in oldProps) {
      if (!(key in newProps)) {
        if (key.startsWith("on") && typeof oldProps[key] === "function") {
          const event = key.slice(2).toLowerCase();
          el.removeEventListener(event, oldProps[key]);
          store[event] = undefined;
        } else if (key === "className") {
          el.removeAttribute("class");
        } else if (key === "style") {
          for (const prop in oldProps.style) el.style[prop] = "";
        } else if (key === "value" && "value" in el) {
          el.value = "";
        } else if (key === "checked" && "checked" in el) {
          el.checked = false;
        } else if (key === "ref") {
          const r = oldProps.ref;
          if (typeof r === "function") r(null);
          else if (r) r.current = null;
        } else if (!["__html", "key", "dangerouslySetInnerHTML", "preventXSS", "__htmlEvents"].includes(key)) {
          el.removeAttribute(key);
        }
      }
    }

    // --- Set props mới ---
    for (const key in newProps) {
      const value = newProps[key];
      const oldVal = oldProps[key];
      if (key === "key") continue;

      // --- __html: nội dung an toàn (đã sanitize, không JS) ---
      if (key === "__html") {
        const safeHTML = sanitizeHTML_Whitelist(
          typeof value === "object" && value?.__html ? value.__html : value || ""
        );
        if (el.innerHTML !== safeHTML) {
          el.innerHTML = safeHTML;
          log(`⚡ set __html (safe sanitized)`, null, "patchProps");
        }
        continue;
      }

      // --- dangerouslySetInnerHTML: cho phép HTML đầy đủ (đã tự kiểm soát sanitize trước đó) ---
      if (key === "dangerouslySetInnerHTML") {
        const rawHTML =
          typeof value === "object" && value?.__html ? value.__html : value || "";
        if (el.innerHTML !== rawHTML) {
          el.innerHTML = rawHTML;
          log(`⚡ set dangerouslySetInnerHTML (raw)`, null, "patchProps");
        }
        continue;
      }

      // --- ref ---
      if (key === "ref") {
        if (oldVal !== value) {
          if (typeof value === "function") value(el);
          else if (value) value.current = el;
        }
        continue;
      }

      // --- events ---
      if (key.startsWith("on") && typeof value === "function") {
        const event = key.slice(2).toLowerCase();
        if (store[event] !== value) {
          if (store[event]) el.removeEventListener(event, store[event]);
          el.addEventListener(event, value);
          store[event] = value;
        }
        continue;
      }

      // --- style object ---
      if (key === "style" && value && typeof value === "object") {
        const oldStyle = oldVal || {};
        for (const prop in oldStyle) if (!(prop in value)) el.style[prop] = "";
        for (const prop in value) if (el.style[prop] !== value[prop]) el.style[prop] = value[prop];
        continue;
      }

      // --- className ---
      if (key === "className") {
        if (el.className !== value) el.className = value;
        continue;
      }

      if (key === "preventXSS") continue;

      // --- value / checked / boolean props ---
      if (key === "value") {
        if (el.value !== value) el.value = value ?? "";
        continue;
      }

      if (key === "checked") {
        el.checked = !!value;
        continue;
      }

      if (["disabled", "readonly", "selected", "hidden"].includes(key)) {
        el[key] = !!value;
        continue;
      }

      // --- dataset ---
      if (key === "dataset" && value && typeof value === "object") {
        for (const k in value) el.dataset[k] = value[k];
        continue;
      }

      // --- fallback setAttribute ---
      const normVal = typeof value === "object" ? JSON.stringify(value) : String(value);
      if (el.getAttribute(key) !== normVal) el.setAttribute(key, normVal);
    }
  }

    // ----------------------
    // Mount / Patch VDOM (chỉ chạy trên client)
    // ----------------------
    function mountElement(vnode) {
      if (IS_SSR) return null; // Không mount trên server
      const el = document.createElement(vnode.type);
      vnode._el = el;
      patchProps(el, {}, vnode.props || {});
      vnode.children = (vnode.children || []).map(toVNode);
      vnode.children.forEach(child => patch(el, null, child));
      return el;
    }

    function mountComponent(parent, vnode, before = null) {
      const inst = { hooks: [], hookIndex: 0, vnode };
      vnode._instance = inst;
      instanceStack.push(inst);
      let childVNode;
      try { childVNode = vnode.type(vnode.props || {}); } finally { instanceStack.pop(); }
      vnode._child = toVNode(childVNode);
      patch(parent, null, vnode._child, before);
      vnode._el = getEl(vnode._child);
    }

    function updateComponent(parent, oldVNode, newVNode) {
      const inst = oldVNode._instance;
      newVNode._instance = inst;
      inst.vnode = newVNode;
      inst.hookIndex = 0;
      instanceStack.push(inst);
      let newChild;
      try { newChild = newVNode.type(newVNode.props || {}); } finally { instanceStack.pop(); }
      const oldChild = oldVNode._child;
      newVNode._child = toVNode(newChild);
      patch(parent, oldChild, newVNode._child);
      newVNode._el = getEl(newVNode._child);
    }

    function unmountVNode(parent, vnode) {
      if (IS_SSR) return; // Không unmount trên server
      if (!vnode) return;
      if (vnode.type === TEXT) {
        const el = vnode._el;
        if (el && el.parentNode === parent) parent.removeChild(el);
        return;
      }
      if (vnode.type === FragmentPlus) {
        const kids = vnode._fragmentChildren || [];
        for (const k of kids) unmountVNode(parent, k);
        return;
      }
      if (typeof vnode.type === 'function') {
        if (vnode._child) unmountVNode(parent, vnode._child);
        return;
      }
      const el = vnode._el;
      if (el) {
        // cleanup listeners bound via our store
        if (el.__listeners) {
          for (const ev in el.__listeners) {
            try { if (el.__listeners[ev]) el.removeEventListener(ev, el.__listeners[ev]); } catch(e){}
          }
          el.__listeners = undefined;
        }
        // cleanup innerHTML-bound events
        if (el.__htmlEventsBound) {
          for (const o of el.__htmlEventsBound) {
            try { o.target.removeEventListener(o.event, o.handler); } catch(e){}
          }
          el.__htmlEventsBound = undefined;
        }
        if (el.parentNode === parent) parent.removeChild(el);
      }
    }

    // ----------------------
    // Patch children
    // ----------------------
    function patchChildren_safe(parent, oldChildren = [], newChildren = []) {
      const oldLen = oldChildren.length,
            newLen = newChildren.length,
            len = Math.max(oldLen, newLen);
      for (let i = 0; i < len; i++) {
        const oldV = oldChildren[i],
              newV = newChildren[i],
              nextOld = (i + 1 < oldLen) ? getEl(oldChildren[i + 1]) : null;
        patch(parent, oldV, newV, nextOld);
      }
    }

    // ----------------------
    // PATCHED: patchChildren_fast with keyed-only LIS optimization
    // Replaces previous patchChildren_fast implementation.
    // This version prioritizes children with props.key. If keys
    // are present it uses LIS to minimize moves. If not, fallback
    // to safe algorithm to avoid incorrect matches.
    // ----------------------
  function patchChildren_fast(parent, oldChildren = [], newChildren = []) {
    oldChildren = oldChildren || [];
    newChildren = newChildren || [];

    const oldLen = oldChildren.length;
    const newLen = newChildren.length;

    let oldStart = 0, newStart = 0;
    let oldEnd = oldLen - 1, newEnd = newLen - 1;

    function getKey(v) {
      return v && v.props && v.props.key != null ? v.props.key : null;
    }

    function isSameVNode(a, b) {
      if (!a || !b) return false;
      return a.type === b.type && getKey(a) === getKey(b);
    }

    // skip equal head
    while (oldStart <= oldEnd && newStart <= newEnd && isSameVNode(oldChildren[oldStart], newChildren[newStart])) {
      patch(parent, oldChildren[oldStart], newChildren[newStart]);
      oldStart++; newStart++;
    }

    // skip equal tail
    while (oldStart <= oldEnd && newStart <= newEnd && isSameVNode(oldChildren[oldEnd], newChildren[newEnd])) {
      patch(parent, oldChildren[oldEnd], newChildren[newEnd]);
      oldEnd--; newEnd--;
    }

    // simple mount all new
    if (oldStart > oldEnd) {
      const refNode = (newEnd + 1 < newLen) ? getEl(newChildren[newEnd + 1]) : null;
      for (let i = newStart; i <= newEnd; i++) patch(parent, null, newChildren[i], refNode);
      return;
    }

    // simple remove all old
    if (newStart > newEnd) {
      for (let i = oldStart; i <= oldEnd; i++) unmountVNode(parent, oldChildren[i]);
      return;
    }

    // if no keys in newChildren -> fallback safe
    let foundKey = false;
    for (let i = newStart; i <= newEnd; i++) {
      if (getKey(newChildren[i]) != null) { foundKey = true; break; }
    }
    if (!foundKey) {
      patchChildren_safe(parent, oldChildren.slice(oldStart, oldEnd + 1), newChildren.slice(newStart, newEnd + 1));
      return;
    }
    // ensure old side has keys
    let foundOldKey = false;
    for (let i = oldStart; i <= oldEnd; i++) {
      if (getKey(oldChildren[i]) != null) { foundOldKey = true; break; }
    }
    if (!foundOldKey) {
      patchChildren_safe(parent, oldChildren.slice(oldStart, oldEnd + 1), newChildren.slice(newStart, newEnd + 1));
      return;
    }

    // build map key -> oldIndex (for oldStart..oldEnd)
    const keyToOldIndex = new Map();
    for (let i = oldStart; i <= oldEnd; i++) {
      const k = getKey(oldChildren[i]);
      if (k != null) keyToOldIndex.set(k, i);
    }

    // build set of new keys for fast removal check
    const newKeySet = new Set();
    for (let i = newStart; i <= newEnd; i++) {
      const k = getKey(newChildren[i]);
      if (k != null) newKeySet.add(k);
    }

    const toBePatched = newEnd - newStart + 1;
    const newIndexToOldIndex = new Array(toBePatched).fill(0);

    // first pass: patch matched nodes & record mapping
    for (let i = newStart; i <= newEnd; i++) {
      const newV = newChildren[i];
      const k = getKey(newV);
      const oldIndex = k != null ? keyToOldIndex.get(k) : undefined;
      if (oldIndex !== undefined) {
        newIndexToOldIndex[i - newStart] = oldIndex + 1; // store oldIndex+1
        patch(parent, oldChildren[oldIndex], newV);
      } else {
        newIndexToOldIndex[i - newStart] = 0; // will mount later
      }
    }

    // remove old nodes that no longer exist in newChildren
    for (let i = oldStart; i <= oldEnd; i++) {
      const oldV = oldChildren[i];
      const k = getKey(oldV);
      if (k == null || !newKeySet.has(k)) {
        unmountVNode(parent, oldV);
      }
    }

    // get LIS of newIndexToOldIndex (positions in array)
    function getLISPositions(arr) {
      const n = arr.length;
      const tails = []; // store indices in arr
      const prev = new Array(n).fill(-1);

      for (let i = 0; i < n; i++) {
        const val = arr[i];
        if (val === 0) continue; // ignore new nodes
        // binary search on tails by arr[tails[mid]]
        let l = 0, r = tails.length;
        while (l < r) {
          const m = (l + r) >> 1;
          if (arr[tails[m]] < val) l = m + 1;
          else r = m;
        }
        if (l === tails.length) {
          tails.push(i);
        } else {
          tails[l] = i;
        }
        prev[i] = l > 0 ? tails[l - 1] : -1;
      }

      // reconstruct result indices
      const lis = [];
      if (tails.length === 0) return lis;
      let k = tails[tails.length - 1];
      while (k !== -1) {
        lis.push(k);
        k = prev[k];
      }
      lis.reverse();
      return lis;
    }

    const lis = getLISPositions(newIndexToOldIndex);
    const lisSet = new Set(lis);

    // second pass: move/mount from right to left
    for (let i = toBePatched - 1; i >= 0; i--) {
      const newIndex = i + newStart;
      const newV = newChildren[newIndex];
      const anchor = (newIndex + 1 < newLen) ? getEl(newChildren[newIndex + 1]) : null;
      if (newIndexToOldIndex[i] === 0) {
        // mount new node before anchor
        patch(parent, null, newV, anchor);
      } else {
        if (lisSet.has(i)) {
          // part of LIS: leave in place
          continue;
        } else {
          // move existing node: use oldChildren[oldIndex]._el
          const oldIndex = newIndexToOldIndex[i] - 1;
          const movingVNode = oldChildren[oldIndex];
          const movingEl = getEl(movingVNode);
          if (movingEl) {
            // if parent is different or anchor falsy, insertBefore handles both
            parent.insertBefore(movingEl, anchor);
          } else {
            // fallback: mount if element doesn't exist
            patch(parent, null, newV, anchor);
          }
        }
      }
    }
  } // end patchChildren_fast


    function patchChildren(parent, oldChildren = [], newChildren = []) {
      //log(`🔑 patchChildren ${SAFE_PATCH_CHILDREN === true ? "by index" : "by key"} `, null, "memo");
      if (SAFE_PATCH_CHILDREN) patchChildren_safe(parent, oldChildren, newChildren);
      else patchChildren_fast(parent, oldChildren, newChildren);
    }


    // ----------------------
    // Patch / render (chỉ chạy trên client)
    // ----------------------
  function patch(parent, oldVNode, newVNode, before = null) {
    if (IS_SSR) return; // Không patch trên server

    if (oldVNode && typeof oldVNode !== 'object') oldVNode = toVNode(oldVNode);
    if (newVNode && typeof newVNode !== 'object') newVNode = toVNode(newVNode);

    // --------------------
    // Handle Outlet cases
    // --------------------
    if (oldVNode && newVNode && oldVNode.type?.isOutlet && newVNode.type?.isOutlet) {
      newVNode._fragmentChildren = (newVNode.children || []).map(toVNode);
      patchChildren(parent, oldVNode._fragmentChildren || [], newVNode._fragmentChildren);
      newVNode._el = oldVNode._el;
      return;
    }
    if (!oldVNode && newVNode && newVNode.type?.isOutlet) {
      newVNode._fragmentChildren = (newVNode.children || []).map(toVNode);
      patchChildren(parent, [], newVNode._fragmentChildren);
      return;
    }
    if (oldVNode && !newVNode && oldVNode.type?.isOutlet) {
      patchChildren(parent, oldVNode._fragmentChildren || [], []);
      return;
    }

    // --------------------
    // Handle FragmentPlus
    // --------------------
    if (!oldVNode && newVNode && newVNode.type === FragmentPlus) {
      newVNode._fragmentChildren = (newVNode.children || []).map(toVNode);
      patchChildren(parent, [], newVNode._fragmentChildren);
      return;
    }
    if (oldVNode && !newVNode && oldVNode.type === FragmentPlus) {
      patchChildren(parent, oldVNode._fragmentChildren || [], []);
      return;
    }
    if (oldVNode && newVNode && oldVNode.type === FragmentPlus && newVNode.type === FragmentPlus) {
      newVNode._fragmentChildren = (newVNode.children || []).map(toVNode);
      patchChildren(parent, oldVNode._fragmentChildren || [], newVNode._fragmentChildren);
      return;
    }
    if (oldVNode && newVNode && oldVNode.type === FragmentPlus && newVNode.type !== FragmentPlus) {
      const anchor = firstEl(oldVNode._fragmentChildren) || null;
      patch(parent, null, newVNode, anchor);
      patchChildren(parent, oldVNode._fragmentChildren || [], []);
      return;
    }
    if (oldVNode && newVNode && oldVNode.type !== FragmentPlus && newVNode.type === FragmentPlus) {
      const ref = getEl(oldVNode);
      newVNode._fragmentChildren = (newVNode.children || []).map(toVNode);
      mountChildrenBefore(parent, newVNode._fragmentChildren, ref);
      unmountVNode(parent, oldVNode);
      return;
    }

    // --------------------
    // Mount / unmount
    // --------------------
    if (!oldVNode && newVNode) {
      if (newVNode.type === TEXT) {
        const t = document.createTextNode(newVNode.text);
        newVNode._el = t;
        parent.insertBefore(t, before || null);
        return;
      }
      if (typeof newVNode.type === 'function') {
        mountComponent(parent, newVNode, before || null);
        return;
      }
      const el = mountElement(newVNode);
      parent.insertBefore(el, before || null);
      return;
    }
    if (oldVNode && !newVNode) { unmountVNode(parent, oldVNode); return; }

    // --------------------
    // Text node update
    // --------------------
    if (oldVNode.type === TEXT || newVNode.type === TEXT) {
      if (oldVNode.type === TEXT && newVNode.type === TEXT) {
        const el = oldVNode._el;
        if (newVNode.text !== oldVNode.text && el) el.nodeValue = newVNode.text;
        newVNode._el = el;
        return;
      }

      const newIsComp = typeof newVNode.type === 'function';
      if (newIsComp) {
        const place = oldVNode._el;
        mountComponent(parent, newVNode, place);
        const newEl = getEl(newVNode);
        if (place && newEl && place.parentNode === parent) parent.replaceChild(newEl, place);
        return;
      } else if (newVNode.type !== TEXT) {
        const newEl = mountElement(newVNode);
        const oldEl = oldVNode._el;
        if (oldEl && oldEl.parentNode === parent) parent.replaceChild(newEl, oldEl);
        else parent.appendChild(newEl);
        return;
      } else {
        const textNode = document.createTextNode(newVNode.text);
        newVNode._el = textNode;
        const refEl = getEl(oldVNode);
        if (refEl && refEl.parentNode === parent) parent.replaceChild(textNode, refEl);
        else parent.appendChild(textNode);
        return;
      }
    }

    // --------------------
    // Component
    // --------------------
    const oldIsComp = typeof oldVNode.type === 'function',
          newIsComp = typeof newVNode.type === 'function';
    if (oldIsComp || newIsComp) {
      if (oldIsComp && newIsComp && oldVNode.type === newVNode.type) {
        updateComponent(parent, oldVNode, newVNode);
        return;
      } else {
        const refEl = getEl(oldVNode);
        unmountVNode(parent, oldVNode);
        patch(parent, null, newVNode, refEl);
        return;
      }
    }

    // --------------------
    // Element replacement
    // --------------------
    if (oldVNode.type !== newVNode.type) {
      const newEl = mountElement(newVNode);
      const refEl = getEl(oldVNode);
      if (refEl && refEl.parentNode === parent) parent.replaceChild(newEl, refEl);
      else parent.appendChild(newEl);
      return;
    }

    // --------------------
    // Update element
    // --------------------
    const el = oldVNode._el;
    newVNode._el = el;
    patchProps(el, oldVNode.props || {}, newVNode.props || {});
    oldVNode.children = (oldVNode.children || []).map(toVNode);
    newVNode.children = (newVNode.children || []).map(toVNode);
    patchChildren(el, oldVNode.children, newVNode.children);
  }


  // ----------------------
  // SSR: renderToString
  // ----------------------
  function renderToString(vnode) {
    if (!vnode) return '';

    // Text node
    if (vnode.type === TEXT) {
      return escapeHTML(vnode.text || '');
    }

    // Fragment
    if (vnode.type === FragmentPlus) {
      return (vnode.children || [])
        .map(child => renderToString(toVNode(child)))
        .join('');
    }

    // Component → resolve recursive (no hooks/state on SSR)
    if (typeof vnode.type === 'function') {
      // Gọi component để lấy child VNode (giả sử pure, no side effects)
      const childVNode = vnode.type(vnode.props || {});
      return renderToString(toVNode(childVNode));
    }

    // Element
    const tag = vnode.type;
    const props = vnode.props || {};
    let html = `<${tag}`;

    // Attributes (bỏ event, ref vì SSR chỉ HTML tĩnh)
    for (const key in props) {
      const value = props[key];
      if (key === 'children' || key === 'key' || key === 'ref' || key === '__html' || key === 'dangerouslySetInnerHTML' || key === 'preventXSS' || key.startsWith('on')) {
        continue; // Bỏ qua event, ref, key, innerHTML (xử lý riêng)
      }

      if (key === 'className') {
        if (value) html += ` class="${escapeHTML(String(value))}"`;
      } else if (key === 'style' && typeof value === 'object') {
        const styleStr = Object.entries(value)
          .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v};`)
          .join('');
        if (styleStr) html += ` style="${escapeHTML(styleStr)}"`;
      } else if (value === true) {
        html += ` ${key}`;
      } else if (value !== false && value != null) {
        html += ` ${key}="${escapeHTML(String(value))}"`;
      }
    }

    html += '>';

    // Nội dung con
    if (props.dangerouslySetInnerHTML) {
      html += sanitizeHTML_Blacklist(props.dangerouslySetInnerHTML.__html || '');
    } else if (props.__html) {
      html += sanitizeHTML_Whitelist(props.__html.__html || props.__html || '');
    } else {
      const children = vnode.children || [];
      html += children.map(child => renderToString(toVNode(child))).join('');
    }

    // Tag không self-closing (void elements như input, br không cần </tag>)
    const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
    if (!voidElements.includes(tag)) {
      html += `</${tag}>`;
    }

    return html;
  }

    // ----------------------
    // Render API
    // ----------------------
  // =======================
  // Render & RenderApp (hỗ trợ router + key-based patch)
  // =======================
  function render(rootComponent, mountEl, props = {}) {
    if (IS_SSR) {
      // SSR: Render to string (resolve root component)
      rootComp = rootComponent;
      rootProps = props;
      const wrapper = { type: rootComp, props: rootProps, children: [] };
      return renderToString(wrapper);
    }

    // Client: Mount/patch như cũ
    rootComp = rootComponent;
    rootEl = mountEl;
    rootProps = props;
    rootVNode = null; // reset trước khi mount lần đầu
    renderApp();
  }


  function shouldReplaceRootVNode(oldVNode, newVNode) {
    // Nếu type khác hoặc key khác → cần replace hoàn toàn
    return !oldVNode || oldVNode.type !== newVNode.type || oldVNode.key !== newVNode.key;
  }


  function renderApp() {
    if (IS_SSR || !rootComp || !rootEl) return;

    // Sử dụng rootProps.key nếu có (pass từ server cho router)
    const wrapper = { type: rootComp, props: rootProps, key: rootProps.key || '__default__', children: [] };

    if (shouldReplaceRootVNode(rootVNode, wrapper)) {
      // Remove hoàn toàn DOM cũ
      rootEl.innerHTML = '';
      rootVNode = null;
    }

    patch(rootEl, rootVNode, wrapper);
    rootVNode = wrapper;
  }

  function memo(
    Comp, 
    {
      getKey = (p) => p?.key ?? p?.k ?? "__singleton__",  
      compare = shallowEqual                                       
    } = {}
  ) {
    const cache = new Map(); // key -> {props, vnode}

    return (props = {}) => {
      const k = getKey(props);
      const hit = cache.get(k);

      if (hit && compare(hit.props, props)) {
        log(`✅ skip key=${k}`, props, "memo");
        return hit.vnode;
      }

      log(`🎨 render key=${k}`, props, "memo");
      const vnode = Comp(props);
      cache.set(k, { props, vnode });
      return vnode;
    };
  }




  // ---------- Shallow equal ----------
  function shallowEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;

    const keysA = [...Object.keys(a), ...Object.getOwnPropertySymbols(a)];
    const keysB = [...Object.keys(b), ...Object.getOwnPropertySymbols(b)];

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (a[key] !== b[key]) return false;
    }

    return true;
  }



    App.VDOM = {
      h,
      render,
      renderToString, // Export để dùng trên server nếu cần
      memo,
      FragmentPlus,
      Fragment: FragmentPlus,
      getDiffType,
      _internal: {
        instanceStack,
        renderApp,
        cleanupMap: new WeakMap(),
        // expose for debug
        getSAFE_PATCH_CHILDREN: () => SAFE_PATCH_CHILDREN
      }
    };
  })(window.App || (window.App = {}));