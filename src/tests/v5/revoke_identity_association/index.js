describe('Revoke identity association', function() {
  require('./revoke_identity_association_mode_2');
  require('./revoke_identity_association_mode_3');
  require('./revoke_identity_association_mode_3_only_1_idp');

  require('./recreate_after_revoke_identity_association_mode_2')

  require('./error_response');
});
