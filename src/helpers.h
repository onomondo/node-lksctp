#pragma once

#define NAPI_VERSION 8
#include <node_api.h>

#include <stdlib.h>
#include <stdio.h>

static void napi_helper_abort_on_error(napi_env env, napi_status status) {
  if (status != napi_ok) {
    abort();
  }
}

static void abort_with_message(const char* message) {
  fprintf(stderr, "%s\n", message);
  fflush(stderr);
  abort();
}

static void napi_helper_abort_on_error_with_message(napi_env env, napi_status status, const char* message) {
  if (status != napi_ok) {
    abort_with_message(message);
  }
}

static napi_value napi_helper_get_undefined(napi_env env) {
  napi_status status;
  napi_value js_undefined;
  status = napi_get_undefined(env, &js_undefined);
  if (status != napi_ok) {
    abort();
  }
  return js_undefined;
}

static napi_status napi_helper_require_args_or_throw(napi_env env, napi_callback_info info, size_t required_args, napi_value* args) {
  size_t argc = required_args;
  napi_status status;

  status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (status != napi_ok) {
    napi_throw_error(env, NULL, "invalid arguments");
    return status;
  }

  if (argc < required_args) {
    napi_throw_error(env, NULL, "invalid arguments");
    return napi_invalid_arg;
  }

  return napi_ok;
}

static napi_status napi_helper_require_args_asserted(napi_env env, napi_callback_info info, size_t required_args, napi_value* args, const char* assertion_message) {
  size_t argc = required_args;
  napi_status status;

  status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (status != napi_ok) {
    abort_with_message(assertion_message);
  }

  if (argc != required_args) {
    abort_with_message(assertion_message);
  }

  return napi_ok;
}

static napi_status napi_helper_require_named_property(napi_env env, napi_value obj, const char* name, napi_value* value) {
  napi_status status;
  napi_valuetype value_type;

  status = napi_get_named_property(env, obj, name, value);
  if (status != napi_ok) {
    return status;
  }

  status = napi_typeof(env, *value, &value_type);
  if (value_type == napi_undefined) {
    return napi_invalid_arg;
  }

  return napi_ok;
}

static napi_status napi_helper_require_named_object(napi_env env, napi_value obj, const char* name, napi_value* value) {
  napi_status status;
  napi_valuetype value_type;

  status = napi_get_named_property(env, obj, name, value);
  if (status != napi_ok) {
    return status;
  }

  status = napi_typeof(env, *value, &value_type);
  if (value_type != napi_object) {
    return napi_invalid_arg;
  }

  return napi_ok;
}

static napi_value napi_helper_require_named_object_asserted(napi_env env, napi_value obj, const char* name, const char* assertion_message) {
  napi_status status;
  napi_value js_obj;

  status = napi_helper_require_named_object(env, obj, name, &js_obj);
  napi_helper_abort_on_error_with_message(env, status, assertion_message);

  return js_obj;
}

static napi_status napi_helper_require_named_function(napi_env env, napi_value obj, const char* name, napi_value* value) {
  napi_status status;
  napi_valuetype value_type;

  status = napi_get_named_property(env, obj, name, value);
  if (status != napi_ok) {
    return status;
  }

  status = napi_typeof(env, *value, &value_type);
  if (value_type != napi_function) {
    return napi_invalid_arg;
  }

  return napi_ok;
}

static napi_value napi_helper_require_named_function_asserted(napi_env env, napi_value obj, const char* name, const char* assertion_message) {
  napi_status status;
  napi_value js_func;

  status = napi_helper_require_named_function(env, obj, name, &js_func);
  napi_helper_abort_on_error_with_message(env, status, assertion_message);

  return js_func;
}

static napi_status napi_helper_require_named_int32(napi_env env, napi_value obj, const char* name, int32_t* value) {
  napi_status status;
  napi_value js_value;

  status = napi_helper_require_named_property(env, obj, name, &js_value);
  if (status != napi_ok) {
    return status;
  }

  status = napi_get_value_int32(env, js_value, value);
  if (status != napi_ok) {
    return status;
  }

  return napi_ok;
}

static uint32_t napi_helper_require_named_int32_asserted(napi_env env, napi_value obj, const char* name, const char* assertion_message) {
  napi_status status;
  int32_t value;

  status = napi_helper_require_named_int32(env, obj, name, &value);
  napi_helper_abort_on_error_with_message(env, status, assertion_message);

  return value;
}

static napi_status napi_helper_require_named_uint32(napi_env env, napi_value obj, const char* name, uint32_t* value) {
  napi_status status;
  napi_value js_value;

  status = napi_helper_require_named_property(env, obj, name, &js_value);
  if (status != napi_ok) {
    return status;
  }

  status = napi_get_value_uint32(env, js_value, value);
  if (status != napi_ok) {
    return status;
  }

  return napi_ok;
}

static uint32_t napi_helper_require_named_uint32_asserted(napi_env env, napi_value obj, const char* name, const char* assertion_message) {
  napi_status status;
  uint32_t value;

  status = napi_helper_require_named_uint32(env, obj, name, &value);
  napi_helper_abort_on_error_with_message(env, status, assertion_message);

  return value;
}

static napi_status napi_helper_require_named_bool(napi_env env, napi_value obj, const char* name, int* value) {
  napi_status status;
  napi_value js_value;
  bool bool_value;
  napi_valuetype value_type;

  status = napi_helper_require_named_property(env, obj, name, &js_value);
  if (status != napi_ok) {
    return status;
  }

  status = napi_typeof(env, js_value, &value_type);
  if (value_type != napi_boolean) {
    return napi_invalid_arg;
  }

  status = napi_get_value_bool(env, js_value, &bool_value);
  if (status != napi_ok) {
    return status;
  }

  *value = bool_value ? 1 : 0;

  return napi_ok;
}

static int napi_helper_require_named_bool_asserted(napi_env env, napi_value obj, const char* name) {
  int bool_value;
  napi_status status;

  status = napi_helper_require_named_bool(env, obj, name, &bool_value);
  napi_helper_abort_on_error(env, status);

  return bool_value;
}

static napi_status napi_helper_require_named_buffer(napi_env env, napi_value obj, const char* name, void* buffer, size_t* buffer_size) {
  napi_status status;
  napi_value js_buffer;

  status = napi_helper_require_named_property(env, obj, name, &js_buffer);
  if (status != napi_ok) {
    return status;
  }

  status = napi_get_buffer_info(env, js_buffer, buffer, buffer_size);
  if (status != napi_ok) {
    return status;
  }

  return napi_ok;
}

static napi_status napi_helper_require_named_array(napi_env env, napi_value obj, const char* name, napi_value* array) {
  napi_status status;
  uint32_t length;

  status = napi_get_named_property(env, obj, name, array);
  if (status != napi_ok) {
    return status;
  }

  status = napi_get_array_length(env, *array, &length);
  if (status != napi_ok) {
    return status;
  }

  return napi_ok;
}

static napi_value napi_helper_require_named_array_asserted(napi_env env, napi_value obj, const char* name, const char* assertion_message) {
  napi_status status;
  napi_value js_array;

  status = napi_helper_require_named_array(env, obj, name, &js_array);
  napi_helper_abort_on_error_with_message(env, status, assertion_message);

  return js_array;
}

static napi_value napi_helper_get_element_asserted(napi_env env, napi_value array, uint32_t index, const char* assertion_message) {
  napi_status status;
  napi_value element;

  status = napi_get_element(env, array, index, &element);
  if (status != napi_ok) {
    abort_with_message(assertion_message);
  }

  return element;
}

static void napi_helper_require_buffer_asserted(napi_env env, napi_value obj, void* buffer, size_t* buffer_size, const char* assertion_message) {
  napi_status status;

  status = napi_get_buffer_info(env, obj, buffer, buffer_size);
  if (status != napi_ok) {
    abort_with_message(assertion_message);
  }
}

static void napi_helper_require_named_buffer_asserted(napi_env env, napi_value obj, const char* name, void* buffer, size_t* buffer_size, const char* assertion_message) {
  napi_status status;

  status = napi_helper_require_named_buffer(env, obj, name, buffer, buffer_size);
  napi_helper_abort_on_error_with_message(env, status, assertion_message);
}

static void napi_helper_add_function_field_asserted(napi_env env, napi_value obj, const char* name, napi_callback cb, void* data, const char* assertion_message) {
  napi_value fn;
  napi_status status;

  status = napi_create_function(env, name, NAPI_AUTO_LENGTH, cb, data, &fn);
  if (status != napi_ok) {
    abort_with_message(assertion_message);
  }

  status = napi_set_named_property(env, obj, name, fn);
  if (status != napi_ok) {
    abort_with_message(assertion_message);
  }
}

static napi_value napi_helper_create_int32(napi_env env, int32_t value) {
  napi_value js_value;
  napi_status status;

  status = napi_create_int32(env, value, &js_value);
  if (status != napi_ok) {
    napi_throw_error(env, NULL, "failed to create int32");
    return napi_helper_get_undefined(env);
  }

  return js_value;
}

static napi_value napi_helper_create_uint64(napi_env env, uint64_t value) {
  napi_value js_value;
  napi_status status;

  status = napi_create_bigint_uint64(env, value, &js_value);
  if (status != napi_ok) {
    napi_throw_error(env, NULL, "failed to create uint64");
    return napi_helper_get_undefined(env);
  }

  return js_value;
}

static void napi_helper_set_named_property_asserted(napi_env env, napi_value obj, const char* name, napi_value value) {
  napi_status status;

  status = napi_set_named_property(env, obj, name, value);
  if (status != napi_ok) {
    abort();
  }
}

static void napi_helper_add_int32_field_asserted(napi_env env, napi_value obj, const char* name, int32_t value) {
  napi_value js_value;
  napi_status status;

  js_value = napi_helper_create_int32(env, value);

  status = napi_set_named_property(env, obj, name, js_value);
  if (status != napi_ok) {
    abort();
  }
}

static void napi_helper_add_uint64_field_asserted(napi_env env, napi_value obj, const char* name, uint64_t value) {
  napi_value js_value;
  napi_status status;

  js_value = napi_helper_create_uint64(env, value);

  status = napi_set_named_property(env, obj, name, js_value);
  if (status != napi_ok) {
    abort();
  }
}

static void napi_helper_add_bool_field_asserted(napi_env env, napi_value obj, const char* name, int32_t value) {
  napi_value js_value;
  napi_status status;

  status = napi_get_boolean(env, value, &js_value);
  if (status != napi_ok) {
    abort();
  }

  status = napi_set_named_property(env, obj, name, js_value);
  if (status != napi_ok) {
    abort();
  }
}

static napi_value napi_helper_create_object_asserted(napi_env env) {
  napi_value obj;
  napi_status status;

  status = napi_create_object(env, &obj);
  if (status != napi_ok) {
    abort();
  }

  return obj;
}

static napi_value napi_helper_create_errno_result_asserted(napi_env env, int errno_value) {
  napi_value result;

  result = napi_helper_create_object_asserted(env);
  napi_helper_add_int32_field_asserted(env, result, "errno", errno_value);

  return result;
}

static void napi_helper_open_handle_scope_asserted(napi_env env, napi_handle_scope* handle_scope) {
  napi_status status;

  status = napi_open_handle_scope(env, handle_scope);
  if (status != napi_ok) {
    abort_with_message("failed to open handle scope");
  }
}

static void napi_helper_close_handle_scope_asserted(napi_env env, napi_handle_scope handle_scope) {
  napi_status status;

  status = napi_close_handle_scope(env, handle_scope);
  if (status != napi_ok) {
    abort_with_message("failed to close handle scope");
  }
}

static void napi_helper_wrap_asserted(napi_env env, napi_value js_object, void* native_object, napi_finalize finalize_cb, void* finalize_hint, napi_ref* result, const char* assertion_message) {
  napi_status status;

  status = napi_wrap(env, js_object, native_object, finalize_cb, finalize_hint, result);
  if (status != napi_ok) {
    abort_with_message(assertion_message);
  }
}

static napi_ref napi_helper_create_reference_asserted(napi_env env, napi_value value, uint32_t initial_refcount, const char* assertion_message) {
  napi_ref ref;
  napi_status status;

  status = napi_create_reference(env, value, initial_refcount, &ref);
  if (status != napi_ok) {
    abort_with_message(assertion_message);
  }

  return ref;
}

static int napi_helper_require_array_length(napi_env env, napi_value array) {
  napi_status status;
  uint32_t length;

  status = napi_get_array_length(env, array, &length);
  if (status != napi_ok) {
    abort();
  }

  return length;
}

static void napi_helper_set_element_asserted(napi_env env, napi_value array, uint32_t index, napi_value value, const char* assertion_message) {
  napi_status status;

  status = napi_set_element(env, array, index, value);
  if (status != napi_ok) {
    abort_with_message(assertion_message);
  }
}

static napi_value napi_helper_create_array_asserted(napi_env env, const char* message) {
  napi_status status;
  napi_value result;

  status = napi_create_array(env, &result);
  if (status != napi_ok) {
    abort_with_message(message);
  }

  return result;
}

static napi_value napi_helper_create_buffer_copy_asserted(napi_env env, const void* ptr, size_t length, const char* message) {
  napi_status status;
  napi_value result;

  status = napi_create_buffer_copy(env, length, ptr, NULL, &result);
  if (status != napi_ok) {
    abort_with_message(message);
  }

  return result;
}
