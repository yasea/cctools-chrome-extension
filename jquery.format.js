/*
* format - jQuery plugin to pretty-print or minify text in XML, JSON, CSS and SQL formats.
* https://github.com/zachofalltrades/jquery.format
*
* Version - 0.1
* Copyright (c) 2013 Zach Shelton
* http://zachofalltrades.net
*
* Based on vkbeautify by Vadim Kiryukhin
* http://www.eslinstructor.net/vkbeautify/
*
* Dual licensed under the MIT and GPL licenses:
*   http://www.opensource.org/licenses/mit-license.php
*   http://www.gnu.org/licenses/gpl.html
*
*/
(function( $ ) {

	/**
	 * utility function called from constructor of Formatter
	 */
	function createShiftArr(step) {
		var space = '    ';
		if ( isNaN(parseInt(step)) ) {  // argument is string
			space = step;
		} else { // argument is integer
			space = new Array(step + 1).join(' '); //space is result of join (a string), not an array
		}
		var shift = ['\n']; // array of shifts
		for(var ix=0;ix<100;ix++){
			shift.push(shift[ix]+space);
		}
		return shift;
	};

	/**
	 *
	 */
	function isSubquery(str, parenthesisLevel) {
		return  parenthesisLevel - (str.replace(/\(/g,'').length - str.replace(/\)/g,'').length );
	};

	/**
	 *
	 */
	function split_sql(str, tab) {
		return str.replace(/\s{1,}/g," ")
		.replace(/ AND /ig,"~::~"+tab+tab+"AND ")
		.replace(/ BETWEEN /ig,"~::~"+tab+"BETWEEN ")
		.replace(/ CASE /ig,"~::~"+tab+"CASE ")
		.replace(/ ELSE /ig,"~::~"+tab+"ELSE ")
		.replace(/ END /ig,"~::~"+tab+"END ")
		.replace(/ FROM /ig,"~::~FROM ")
		.replace(/ GROUP\s{1,}BY/ig,"~::~GROUP BY ")
		.replace(/ HAVING /ig,"~::~HAVING ")
		//.replace(/ SET /ig," SET~::~")
		.replace(/ IN /ig," IN ")
		.replace(/ JOIN /ig,"~::~JOIN ")
		.replace(/ CROSS~::~{1,}JOIN /ig,"~::~CROSS JOIN ")
		.replace(/ INNER~::~{1,}JOIN /ig,"~::~INNER JOIN ")
		.replace(/ LEFT~::~{1,}JOIN /ig,"~::~LEFT JOIN ")
		.replace(/ RIGHT~::~{1,}JOIN /ig,"~::~RIGHT JOIN ")
		.replace(/ ON /ig,"~::~"+tab+"ON ")
		.replace(/ OR /ig,"~::~"+tab+tab+"OR ")
		.replace(/ ORDER\s{1,}BY/ig,"~::~ORDER BY ")
		.replace(/ OVER /ig,"~::~"+tab+"OVER ")
		.replace(/\(\s{0,}SELECT /ig,"~::~(SELECT ")
		.replace(/\)\s{0,}SELECT /ig,")~::~SELECT ")
		.replace(/ THEN /ig," THEN~::~"+tab+"")
		.replace(/ UNION /ig,"~::~UNION~::~")
		.replace(/ USING /ig,"~::~USING ")
		.replace(/ WHEN /ig,"~::~"+tab+"WHEN ")
		.replace(/ WHERE /ig,"~::~WHERE ")
		.replace(/ WITH /ig,"~::~WITH ")
		//.replace(/\,\s{0,}\(/ig,",~::~( ")
		//.replace(/\,/ig,",~::~"+tab+tab+"")
		.replace(/ ALL /ig," ALL ")
		.replace(/ AS /ig," AS ")
		.replace(/ ASC /ig," ASC ")
		.replace(/ DESC /ig," DESC ")
		.replace(/ DISTINCT /ig," DISTINCT ")
		.replace(/ EXISTS /ig," EXISTS ")
		.replace(/ NOT /ig," NOT ")
		.replace(/ NULL /ig," NULL ")
		.replace(/ LIKE /ig," LIKE ")
		.replace(/\s{0,}SELECT /ig,"SELECT ")
		.replace(/\s{0,}UPDATE /ig,"UPDATE ")
		.replace(/ SET /ig," SET ")
		.replace(/~::~{1,}/g,"~::~")
		.split('~::~');
	};


	var Formatter = function (options) {
		this.init(options);
		//TODO - if options object maps any functions, add them as appropriately named methods
		var methodName = this.options.method;
		if (!$.isFunction(this[methodName])) {
			$.error("'" + methodName + "' is not a Formatter method.");
		};
		this.format = function(text) { //alias to currently selected method
			return this[this.options.method].call(this, text);
		};
	};


	/**
	 * putting the methods into the prototype instead of the constructor method
	 * enables more efficient on-the-fly creation of Formatter instances
	 */
	Formatter.prototype = {
		options: {},

		init: function(options) {
			this.options = $.extend({}, $.fn.format.defaults, options);
			this.step = this.options.step;
			this.preserveComments = this.options.preserveComments;
			this.shift = createShiftArr(this.step);
		},

		xml: function(text) {
			var ar = text.replace(/>\s{0,}</g,"><")
						 .replace(/</g,"~::~<")
						 .replace(/\s*xmlns\:/g,"~::~xmlns:")
						 .replace(/\s*xmlns\=/g,"~::~xmlns=")
						 .split('~::~'),
				len = ar.length,
				inComment = false,
				deep = 0,
				str = '',
				ix = 0;

			for(ix=0;ix<len;ix++) {
				// start comment or <![CDATA[...]]> or <!DOCTYPE //
				if(ar[ix].search(/<!/) > -1) {
					str += this.shift[deep]+ar[ix];
					inComment = true;
					// end comment  or <![CDATA[...]]> //
					if(ar[ix].search(/-->/) > -1 || ar[ix].search(/\]>/) > -1 || ar[ix].search(/!DOCTYPE/) > -1 ) {
						inComment = false;
					}
				} else
				// end comment  or <![CDATA[...]]> //
				if(ar[ix].search(/-->/) > -1 || ar[ix].search(/\]>/) > -1) {
					str += ar[ix];
					inComment = false;
				} else
				// <elm></elm> //
				if( /^<\w/.exec(ar[ix-1]) && /^<\/\w/.exec(ar[ix]) &&
					/^<[\w:\-\.\,]+/.exec(ar[ix-1]) == /^<\/[\w:\-\.\,]+/.exec(ar[ix])[0].replace('/','')) {
					str += ar[ix];
					if(!inComment) deep--;
				} else
				 // <elm> //
				if(ar[ix].search(/<\w/) > -1 && ar[ix].search(/<\//) == -1 && ar[ix].search(/\/>/) == -1 ) {
					str = !inComment ? str += this.shift[deep++]+ar[ix] : str += ar[ix];
				} else
				 // <elm>...</elm> //
				if(ar[ix].search(/<\w/) > -1 && ar[ix].search(/<\//) > -1) {
					str = !inComment ? str += this.shift[deep]+ar[ix] : str += ar[ix];
				} else
				// </elm> //
				if(ar[ix].search(/<\//) > -1) {
					str = !inComment ? str += this.shift[--deep]+ar[ix] : str += ar[ix];
				} else
				// <elm/> //
				if(ar[ix].search(/\/>/) > -1 ) {
					str = !inComment ? str += this.shift[deep]+ar[ix] : str += ar[ix];
				} else
				// <? xml ... ?> //
				if(ar[ix].search(/<\?/) > -1) {
					str += this.shift[deep]+ar[ix];
				} else
				// xmlns //
				if( ar[ix].search(/xmlns\:/) > -1  || ar[ix].search(/xmlns\=/) > -1) {
					str += this.shift[deep]+ar[ix];
				}

				else {
					str += ar[ix];
				}
			}

			return  (str[0] == '\n') ? str.slice(1) : str;
		},

		xmlmin: function(text) {
            str = this.preserveComments 
            ? text 
            : text.replace(/<!--[\s\S]*?-->/g, '');
        
            str = str                
                .replace(/\s+/g, ' ')// 移除换行、多余空格
                .replace(/\s+xmlns/g, ' xmlns')// 移除xmlns前的空白                
                .replace(/>\s+</g, '><')// 移除标签间的空白                
                .replace(/\s{2,}/g, ' ')// 移除标签内属性之间多余的空白                
                .replace(/\s*(=)\s*/g, '=');// 处理属性引号周围的空白                
        
            return str.trim(); 
		},

		json: function(text) {
			if ( typeof JSON === 'undefined' ) return text;
			if ( typeof text === "string" ) {
				return JSON.stringify(JSON.parse(text), null, this.step);
			}
			if ( typeof text === "object" ) {
				return JSON.stringify(text, null, this.step);
			}
			return text; // text is not string nor object
		},

		jsonmin: function(text) {
			if (typeof JSON === 'undefined' ) {
				return text;
			}
			return JSON.stringify(JSON.parse(text), null, 0);
		},

		css: function(text) {
			var ar = text.replace(/\s{1,}/g,' ')
						.replace(/\{/g,"{~::~")
						.replace(/\}/g,"~::~}~::~")
						.replace(/\;/g,";~::~")
						.replace(/\/\*/g,"~::~/*")
						.replace(/\*\//g,"*/~::~")
						.replace(/~::~\s{0,}~::~/g,"~::~")
						.split('~::~'),
				len = ar.length,
				deep = 0,
				str = '',
				ix = 0;

			for(ix=0;ix<len;ix++) {

				if( /\{/.exec(ar[ix]))  {
					str += this.shift[deep++]+ar[ix];
				} else
				if( /\}/.exec(ar[ix]))  {
					str += this.shift[--deep]+ar[ix];
				} else
				if( /\*\\/.exec(ar[ix]))  {
					str += this.shift[deep]+ar[ix];
				}
				else {
					str += this.shift[deep]+ar[ix];
				}
			}
			return str.replace(/^\n{1,}/,'');
		},

		cssmin: function(text) {
			var str = this.preserveComments ? text : text.replace(/\/\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*+\//g,"") ;
			return str.replace(/\s{1,}/g,' ')
					.replace(/\{\s{1,}/g,"{")
					.replace(/\}\s{1,}/g,"}")
					.replace(/\;\s{1,}/g,";")
					.replace(/\/\*\s{1,}/g,"/*")
					.replace(/\*\/\s{1,}/g,"*/");
		},

		sql: function(text) {

			var ar_by_quote = text.replace(/\s{1,}/g," ")
									.replace(/\'/ig,"~::~\'")
									.split('~::~'),
				len = ar_by_quote.length,
				ar = [],
				deep = 0,
				tab = this.step,//+this.step,
				parenthesisLevel = 0,
				str = '',
				ix = 0;

				for(ix=0;ix<len;ix++) {
					if(ix%2) {
						ar = ar.concat(ar_by_quote[ix]);
					} else {
						ar = ar.concat(split_sql(ar_by_quote[ix], tab) );
					}
				}

				len = ar.length;
				for(ix=0;ix<len;ix++) {

					parenthesisLevel = isSubquery(ar[ix], parenthesisLevel);

					if( /\s{0,}\s{0,}SELECT\s{0,}/.exec(ar[ix]))  {
						ar[ix] = ar[ix].replace(/\,/g,",\n"+tab+tab+"");
					}

					if( /\s{0,}\s{0,}SET\s{0,}/.exec(ar[ix]))  {
						ar[ix] = ar[ix].replace(/\,/g,",\n"+tab+tab+"");
					}

					if( /\s{0,}\(\s{0,}SELECT\s{0,}/.exec(ar[ix]))  {
						deep++;
						str += this.shift[deep]+ar[ix];
					} else
					if( /\'/.exec(ar[ix]) )  {
						if(parenthesisLevel<1 && deep) {
							deep--;
						}
						str += ar[ix];
					}
					else  {
						str += this.shift[deep]+ar[ix];
						if(parenthesisLevel<1 && deep) {
							deep--;
						}
					}
				}
				str = str.replace(/^\n{1,}/,'').replace(/\n{1,}/g,"\n");
				return str;
		},

		sqlmin: function(text) {
			return text.replace(/\s{1,}/g," ").replace(/\s{1,}\(/,"(").replace(/\s{1,}\)/,")");
		}

	};//end Formatter.prototype


	/**
	 * DOM chaining version
	 */
	$.fn.format = function(options) {
		var fmt = new Formatter(options);
//		var methodName = fmt.options.method;
//		if (!$.isFunction(fmt[methodName])) {
//			$.error("'" + methodName + "' is not a Formatter method.")
//		};
//		console.log("call " + methodName + " on " + $.type(this));
//		console.log(this);
		return this.each(function() {
//			console.log($.type(this));
//			console.log(this);
			var node = $(this);
//			console.log($.type(node));
//			console.log(node);
			var text = node.val();
//			console.log("text ==>\n" + text);
			text = fmt.format(text);
			node.val(text);
		});
	};

	/**
	 * utility version
	 */
	$.format = function(text, options) {
		var fmt = new Formatter(options);
//		var methodName = fmt.options.method;
//		if (!$.isFunction(fmt[methodName])) {
//			$.error("'" + methodName + "' is not a Formatter method.")
//		};
//		console.log("call " + methodName + " on " + $.type(text));
//		console.log(text);
//		return fmt[methodName].call(fmt, text);
		return fmt.format(text);
	};

	/**
	 * default configuration
	 */
	$.fn.format.defaults = {
		method: 'xml', // the method to be called
		step: '    ', // 4 spaces
		preserveComments: false //applies to cssmin and xmlmin functions
	};


})(jQuery);





/**
 * jQuery HTML Formatter Plugin
 * A lightweight, customizable HTML formatting plugin
 */
(function($) {
    'use strict';
  
    const DEFAULT_OPTIONS = {
      indentSize: 2,
      maxLineLength: 80,
      preserveNewlines: false,
      removeComments: true,
      compactTags: ['meta', 'link', 'img', 'br', 'hr', 'input', 'source'],
      inlineTags: ['a', 'span', 'b', 'i', 'strong', 'em', 'code', 'label'],
      noIndentTags: ['html', '!doctype', 'head', 'body'],
      keepWithNext: ['title', 'script', 'style']
    };
  
    class HtmlFormatter {
      constructor(options) {
        this.options = $.extend({}, DEFAULT_OPTIONS, options);
        this.indentLevel = 0;
        this.buffer = [];
        this.inPreTag = false;
      }
  
      format(html) {
        if (!html) return '';
        
        // Pre-process
        html = this._preProcess(html);
        
        // Split into tokens
        const tokens = this._tokenize(html);
        
        // Process each token
        tokens.forEach((token, index) => {
          if (!token.trim()) return;
          this._processToken(token, tokens[index + 1]);
        });
  
        // Post-process
        return this._postProcess();
      }
  
      _preProcess(html) {
        let result = html.trim();
        
        if (this.options.removeComments) {
          result = result.replace(/<!--[\s\S]*?-->/g, '');
        }
  
        // Normalize line endings
        result = result.replace(/\r\n|\r/g, '\n');
        
        // Remove excessive whitespace
        result = result.replace(/\s+</g, '<')
                      .replace(/>\s+/g, '>')
                      .replace(/\s+/g, ' ');
  
        return result;
      }
  
      _tokenize(html) {
        return html.split(/(<[^>]+>)/g).filter(token => token.trim());
      }
  
      _processToken(token, nextToken) {
        const tagName = this._getTagName(token);
        
        // Handle pre tags specially
        if (token.match(/<pre[\s>]/i)) {
          this.inPreTag = true;
          this._addLine(this._getIndent() + token);
          return;
        }
        
        if (token.match(/<\/pre>/i)) {
          this.inPreTag = false;
          this._addLine(this._getIndent() + token);
          return;
        }
        
        if (this.inPreTag) {
          this._addLine(token);
          return;
        }
  
        // Process based on token type
        if (this._isClosingTag(token)) {
          this._processClosingTag(token);
        } else if (this._isOpeningTag(token)) {
          this._processOpeningTag(token, nextToken);
        } else {
          this._processTextContent(token, nextToken);
        }
      }
  
      _processClosingTag(token) {
        const tagName = this._getTagName(token);
        
        if (!this._isInlineTag(tagName)) {
          this.indentLevel--;
        }
        
        if (this._isCompactTag(tagName)) {
          this.buffer[this.buffer.length - 1] += token;
        } else {
          this._addLine(this._getIndent() + token);
        }
      }
  
      _processOpeningTag(token, nextToken) {
        const tagName = this._getTagName(token);
        const indent = this._getIndent();
        
        if (this._isCompactTag(tagName)) {
          if (this.buffer.length && !this._isInlineTag(tagName)) {
            this._addLine(indent + token);
          } else {
            this._addToLastLine(token);
          }
        } else {
          this._addLine(indent + token);
          if (!this._isSelfClosingTag(token) && !this._isInlineTag(tagName)) {
            this.indentLevel++;
          }
        }
      }
  
      _processTextContent(token, nextToken) {
        const content = token.trim();
        if (!content) return;
  
        if (content.length < this.options.maxLineLength) {
          this._addToLastLine(content);
        } else {
          this._addLine(this._getIndent() + content);
        }
      }
  
      _getIndent() {
        if (this.indentLevel < 0) this.indentLevel = 0;
        return ' '.repeat(this.indentLevel * this.options.indentSize);
      }
  
      _addLine(line) {
        this.buffer.push(line);
      }
  
      _addToLastLine(content) {
        if (this.buffer.length) {
          this.buffer[this.buffer.length - 1] += content;
        } else {
          this.buffer.push(content);
        }
      }
  
      _postProcess() {
        return this.buffer
          .filter(line => line.trim())
          .join('\n')
          .trim();
      }
  
      // Utility methods
      _getTagName(token) {
        const match = token.match(/<\/?([^\s>\/]+)/);
        return match ? match[1].toLowerCase() : '';
      }
  
      _isClosingTag(token) {
        return /^<\//.test(token);
      }
  
      _isOpeningTag(token) {
        return /^<[^\/]/.test(token);
      }
  
      _isSelfClosingTag(token) {
        return /\/>$/.test(token) || this._isCompactTag(this._getTagName(token));
      }
  
      _isInlineTag(tagName) {
        return this.options.inlineTags.includes(tagName);
      }
  
      _isCompactTag(tagName) {
        return this.options.compactTags.includes(tagName);
      }
    }
  
    // jQuery plugin definition
    $.fn.formatHtml = function(options) {
      const formatter = new HtmlFormatter(options);
      
      return this.each(function() {
        const $element = $(this);
        const html = $element.is('textarea') ? $element.val() : $element.html();
        const formattedHtml = formatter.format(html);
        
        if ($element.is('textarea')) {
          $element.val(formattedHtml);
        } else {
          $element.html(formattedHtml);
        }
      });
    };
  
    // Expose formatter for direct usage
    $.htmlFormatter = function(html, options) {
      return new HtmlFormatter(options).format(html);
    };
  
  })(jQuery);
  