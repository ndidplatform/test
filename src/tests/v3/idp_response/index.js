describe('(IdP) Response tests', function() {
  require('./error_response');
  require('./response_request_final_stage');
  require('./error_get_request_message_padded_hash');

  //require('./response_invalid_data');  MOVE TO ./error_response
  //require('./error_callback_response'); MOVED TO ./error_response
});
