( function( $ ) {

	'use strict';

	if ( typeof wpcf7 === 'undefined' || wpcf7 === null ) {
		return;
	}

	wpcf7 = $.extend( {
		cached: 0,
		inputs: []
	}, wpcf7 );

	$( function() {
		wpcf7.supportHtml5 = ( function() {
			var features = {};
			var input = document.createElement( 'input' );

			features.placeholder = 'placeholder' in input;

			var inputTypes = [ 'email', 'url', 'tel', 'number', 'range', 'date' ];

			$.each( inputTypes, function( index, value ) {
				input.setAttribute( 'type', value );
				features[ value ] = input.type !== 'text';
			} );

			return features;
		} )();

		$( 'div.wpcf7 > form' ).each( function() {
			var $form = $( this );
			var postId = $form.find( 'input[name="_wpcf7"]' ).val();

			if ( ! $.isNumeric( postId ) ) {
				return;
			}

			if ( wpcf7.cached ) {
				$.ajax( {
					type: 'GET',
					url: wpcf7.apiSettings.root +
						'contact-form-7/v1/contact-forms/' + postId + '/refill',
					dataType: 'json'
				} ).done( function( data, status, xhr ) {
					wpcf7.refill( $form, data );
				} );
			}

			$form.submit( function( event ) {
				$form.find( '[placeholder].placeheld' ).each( function( i, n ) {
					$( n ).val( '' );
				} );

				if ( typeof window.FormData !== 'function' ) {
					return;
				}

				var formData = new FormData( this );

				wpcf7.clearResponse( $form );

				$form.find( '[aria-invalid]' ).attr( 'aria-invalid', 'false' );
				$form.find( '.ajax-loader' ).addClass( 'is-active' );

				$.ajax( {
					type: 'POST',
					url: wpcf7.apiSettings.root +
						'contact-form-7/v1/contact-forms/' + postId + '/feedback',
					data: formData,
					dataType: 'json',
					processData: false,
					contentType: false
				} ).done( function( data, status, xhr ) {
					wpcf7.ajaxSuccess( data, status, xhr, $form );
				} ).fail( function( xhr, status, error ) {
					var e = $( '<div class="ajax-error"></div>' ).text( error.message );
					$form.after( e );
				} );

				event.preventDefault();
			} );

			$form.find( '.wpcf7-submit' ).after( '<span class="ajax-loader"></span>' );

			wpcf7.toggleSubmit( $form );

			$form.find( '.wpcf7-acceptance' ).click( function() {
				wpcf7.toggleSubmit( $form );
			} );

			// Exclusive Checkbox
			$form.find( '.wpcf7-exclusive-checkbox input:checkbox' ).click( function() {
				var name = $( this ).attr( 'name' );
				$form.find( 'input:checkbox[name="' + name + '"]' ).not( this ).prop( 'checked', false );
			} );

			// Free Text Option for Checkboxes and Radio Buttons
			$( '.wpcf7-list-item.has-free-text', $form ).each( function() {
				var $freetext = $( ':input.wpcf7-free-text', this );
				var $wrap = $( this ).closest( '.wpcf7-form-control' );

				if ( $( ':checkbox, :radio', this ).is( ':checked' ) ) {
					$freetext.prop( 'disabled', false );
				} else {
					$freetext.prop( 'disabled', true );
				}

				$( ':checkbox, :radio', $wrap ).change( function() {
					var $cb = $( '.has-free-text', $wrap ).find( ':checkbox, :radio' );

					if ( $cb.is( ':checked' ) ) {
						$freetext.prop( 'disabled', false ).focus();
					} else {
						$freetext.prop( 'disabled', true );
					}
				} );
			} );

			if ( ! wpcf7.supportHtml5.placeholder ) {
				wpcf7.applyPlaceholderFallback( $form );
			}

			if ( wpcf7.jqueryUi && ! wpcf7.supportHtml5.date ) {
				$form.find( 'input.wpcf7-date[type="date"]' ).each( function() {
					$( this ).datepicker( {
						dateFormat: 'yy-mm-dd',
						minDate: new Date( $( this ).attr( 'min' ) ),
						maxDate: new Date( $( this ).attr( 'max' ) )
					} );
				} );
			}

			if ( wpcf7.jqueryUi && ! wpcf7.supportHtml5.number ) {
				$form.find( 'input.wpcf7-number[type="number"]' ).each( function() {
					$( this ).spinner( {
						min: $( this ).attr( 'min' ),
						max: $( this ).attr( 'max' ),
						step: $( this ).attr( 'step' )
					} );
				} );
			}

			$form.find( '.wpcf7-character-count' ).wpcf7CharacterCount();

			$form.find( '.wpcf7-validates-as-url' ).change( function() {
				var val = $.trim( $( this ).val() );

				// check the scheme part
				if ( val && ! val.match( /^[a-z][a-z0-9.+-]*:/i ) ) {
					val = val.replace( /^\/+/, '' );
					val = 'http://' + val;
				}

				$( this ).val( val );
			} );
		} );
	} );

	wpcf7.ajaxSuccess = function( data, status, xhr, $form ) {
		var detail = {
			id: $( data.into ).attr( 'id' ),
			status: data.status,
			inputs: []
		};

		$.each( $form.serializeArray(), function( i, field ) {
			if ( '_wpcf7' == field.name ) {
				detail.contactFormId = field.value;
			} else if ( '_wpcf7_version' == field.name ) {
				detail.pluginVersion = field.value;
			} else if ( '_wpcf7_locale' == field.name ) {
				detail.contactFormLocale = field.value;
			} else if ( '_wpcf7_unit_tag' == field.name ) {
				detail.unitTag = field.value;
			} else if ( '_wpcf7_container_post' == field.name ) {
				detail.containerPostId = field.value;
			} else if ( field.name.match( /^_/ ) ) {
				// do nothing
			} else {
				detail.inputs.push( field );
			}
		} );

		wpcf7.clearResponse( $form );

		var $responseOutput = $form.find( 'div.wpcf7-response-output' );

		$form.find( '.wpcf7-form-control' ).removeClass( 'wpcf7-not-valid' );
		$form.removeClass( 'invalid spam sent failed' );

		switch ( data.status ) {
			case 'validation_failed':
				$.each( data.invalidFields, function( i, n ) {
					wpcf7.notValidTip( $( n.into, $form ), n.message );
					$form.find( n.into ).find( '.wpcf7-form-control' ).addClass( 'wpcf7-not-valid' );
					$form.find( n.into ).find( '[aria-invalid]' ).attr( 'aria-invalid', 'true' );
				} );

				$responseOutput.addClass( 'wpcf7-validation-errors' );
				$form.addClass( 'invalid' );

				wpcf7.triggerEvent( data.into, 'invalid', detail );
				break;
			case 'spam':
				$responseOutput.addClass( 'wpcf7-spam-blocked' );
				$form.addClass( 'spam' );

				$form.find( '[name="g-recaptcha-response"]' ).each( function() {
					if ( '' == $( this ).val() ) {
						var $recaptcha = $( this ).closest( '.wpcf7-form-control-wrap' );
						wpcf7.notValidTip( $recaptcha, wpcf7.recaptcha.messages.empty );
					}
				} );

				wpcf7.triggerEvent( data.into, 'spam', detail );
				break;
			case 'mail_sent':
				$responseOutput.addClass( 'wpcf7-mail-sent-ok' );
				$form.addClass( 'sent' );

				if ( data.onSentOk ) {
					$.each( data.onSentOk, function( i, n ) { eval( n ) } );
				}

				wpcf7.triggerEvent( data.into, 'mailsent', detail );
				break;
			case 'mail_failed':
			case 'acceptance_missing':
			default:
				$responseOutput.addClass( 'wpcf7-mail-sent-ng' );
				$form.addClass( 'failed' );

				wpcf7.triggerEvent( data.into, 'mailfailed', detail );
		}

		wpcf7.refill( $form, data );

		if ( data.onSubmit ) {
			$.each( data.onSubmit, function( i, n ) { eval( n ) } );
		}

		wpcf7.triggerEvent( data.into, 'submit', detail );

		if ( 'mail_sent' == data.status ) {
			$form.each( function() {
				this.reset();
			} );
		}

		$form.find( '[placeholder].placeheld' ).each( function( i, n ) {
			$( n ).val( $( n ).attr( 'placeholder' ) );
		} );

		$responseOutput.append( data.message ).slideDown( 'fast' );
		$responseOutput.attr( 'role', 'alert' );

		wpcf7.updateScreenReaderResponse( $form, data );
	};

	wpcf7.triggerEvent = function( target, name, detail ) {
		var $target = $( target );

		/* DOM event */
		var event = new CustomEvent( 'wpcf7' + name, {
			bubbles: true,
			detail: detail
		} );

		$target.get( 0 ).dispatchEvent( event );

		/* jQuery event */
		$target.trigger( 'wpcf7:' + name, detail );
		$target.trigger( name + '.wpcf7', detail ); // deprecated
	};

	wpcf7.applyPlaceholderFallback = function( $form ) {
		$form.find( '[placeholder]' ).each( function() {
			$( this ).val( $( this ).attr( 'placeholder' ) );
			$( this ).addClass( 'placeheld' );

			$( this ).focus( function() {
				if ( $( this ).hasClass( 'placeheld' ) ) {
					$( this ).val( '' ).removeClass( 'placeheld' );
				}
			} );

			$( this ).blur( function() {
				if ( '' === $( this ).val() ) {
					$( this ).val( $( this ).attr( 'placeholder' ) );
					$( this ).addClass( 'placeheld' );
				}
			} );
		} );
	};

	wpcf7.toggleSubmit = function( $form ) {
		if ( $form.hasClass( 'wpcf7-acceptance-as-validation' ) ) {
			return;
		}

		var $submit = $form.find( 'input:submit' );
		var $acceptance = $form.find( 'input:checkbox.wpcf7-acceptance' );

		if ( ! $submit.length || ! $acceptance.length ) {
			return;
		}

		$submit.removeAttr( 'disabled' );

		$acceptance.each( function() {
			var $a = $( this );

			if ( $a.hasClass( 'wpcf7-invert' ) && $a.is( ':checked' )
			|| ! $a.hasClass( 'wpcf7-invert' ) && ! $a.is( ':checked' ) ) {
				$submit.attr( 'disabled', 'disabled' );
				return false;
			}
		} );
	};

	$.fn.wpcf7CharacterCount = function() {
		return this.each( function() {
			var $count = $( this );
			var name = $count.attr( 'data-target-name' );
			var down = $count.hasClass( 'down' );
			var starting = parseInt( $count.attr( 'data-starting-value' ), 10 );
			var maximum = parseInt( $count.attr( 'data-maximum-value' ), 10 );
			var minimum = parseInt( $count.attr( 'data-minimum-value' ), 10 );

			var updateCount = function( $target ) {
				var length = $target.val().length;
				var count = down ? starting - length : length;
				$count.attr( 'data-current-value', count );
				$count.text( count );

				if ( maximum && maximum < length ) {
					$count.addClass( 'too-long' );
				} else {
					$count.removeClass( 'too-long' );
				}

				if ( minimum && length < minimum ) {
					$count.addClass( 'too-short' );
				} else {
					$count.removeClass( 'too-short' );
				}
			};

			$count.closest( 'form' ).find( ':input[name="' + name + '"]' ).each( function() {
				updateCount( $( this ) );

				$( this ).keyup( function() {
					updateCount( $( this ) );
				} );
			} );
		} );
	};

	wpcf7.notValidTip = function( target, message ) {
		var fadeOut = function( target ) {
			$( target ).not( ':hidden' ).animate( {
				opacity: 0
			}, 'fast', function() {
				$( this ).css( { 'z-index': -100 } );
			} );
		}

		var $target = $( target );

		$target.find( 'span.wpcf7-not-valid-tip' ).remove();
		$target.append( '<span role="alert" class="wpcf7-not-valid-tip">' + message + '</span>' );

		if ( $target.is( '.use-floating-validation-tip *' ) ) {
			$( '.wpcf7-not-valid-tip', $target ).mouseover( function() {
				fadeOut( this );
			} );

			$( ':input', $target ).focus( function() {
				fadeOut( $( '.wpcf7-not-valid-tip', $target ) );
			} );
		}
	}

	wpcf7.refill = function( $form, data ) {
		if ( data.captcha ) {
			$.each( data.captcha, function( i, n ) {
				$form.find( ':input[name="' + i + '"]' ).val( '' );
				$form.find( 'img.wpcf7-captcha-' + i ).attr( 'src', n );
				var match = /([0-9]+)\.(png|gif|jpeg)$/.exec( n );
				$form.find( 'input:hidden[name="_wpcf7_captcha_challenge_' + i + '"]' ).attr( 'value', match[ 1 ] );
			} );
		}

		if ( data.quiz ) {
			$.each( data.quiz, function( i, n ) {
				$form.find( ':input[name="' + i + '"]' ).val( '' );
				$form.find( ':input[name="' + i + '"]' ).siblings( 'span.wpcf7-quiz-label' ).text( n[ 0 ] );
				$form.find( 'input:hidden[name="_wpcf7_quiz_answer_' + i + '"]' ).attr( 'value', n[ 1 ] );
			} );
		}
	};

	wpcf7.clearResponse = function( $form ) {
		var $responseOutput = $form.find( 'div.wpcf7-response-output' );

		$responseOutput.hide().empty().removeAttr( 'role' );

		var wpcf7Classes = [
			'wpcf7-mail-sent-ok',
			'wpcf7-mail-sent-ng',
			'wpcf7-validation-errors',
			'wpcf7-spam-blocked'
		];

		$responseOutput.removeClass( wpcf7Classes.join( ' ' ) );

		$form.find( 'span.wpcf7-not-valid-tip' ).remove();
		$form.find( '.ajax-loader' ).removeClass( 'is-active' );
	};

	wpcf7.updateScreenReaderResponse = function( $form, data ) {
		$( '.wpcf7 .screen-reader-response' ).html( '' ).attr( 'role', '' );

		if ( data.message ) {
			var $response = $form.siblings( '.screen-reader-response' ).first();
			$response.append( data.message );

			if ( data.invalidFields ) {
				var $invalids = $( '<ul></ul>' );

				$.each( data.invalidFields, function( i, n ) {
					if ( n.idref ) {
						var $li = $( '<li></li>' ).append( $( '<a></a>' ).attr( 'href', '#' + n.idref ).append( n.message ) );
					} else {
						var $li = $( '<li></li>' ).append( n.message );
					}

					$invalids.append( $li );
				} );

				$response.append( $invalids );
			}

			$response.attr( 'role', 'alert' ).focus();
		}
	};

} )( jQuery );

/*
 * Polyfill for Internet Explorer
 * See https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent
 */
( function () {
	if ( typeof window.CustomEvent === "function" ) return false;

	function CustomEvent ( event, params ) {
		params = params || { bubbles: false, cancelable: false, detail: undefined };
		var evt = document.createEvent( 'CustomEvent' );
		evt.initCustomEvent( event,
			params.bubbles, params.cancelable, params.detail );
		return evt;
	}

	CustomEvent.prototype = window.Event.prototype;

	window.CustomEvent = CustomEvent;
} )();
