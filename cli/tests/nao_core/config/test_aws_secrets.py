"""Tests for the `{{ aws_secret(...) }}` template resolver in NaoConfig."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from nao_core.config.base import NaoConfig, NaoConfigError


def _mock_boto3_client(values_by_secret_id: dict[str, str]) -> MagicMock:
    """Build a fake boto3 SecretsManager client returning the given JSON strings."""
    client = MagicMock()

    def get_secret_value(SecretId: str) -> dict[str, str]:
        if SecretId not in values_by_secret_id:
            from botocore.exceptions import ClientError

            raise ClientError(
                {"Error": {"Code": "ResourceNotFoundException", "Message": "not found"}},
                "GetSecretValue",
            )
        return {"SecretString": values_by_secret_id[SecretId]}

    client.get_secret_value.side_effect = get_secret_value
    return client


def test_no_aws_secret_references_skips_boto3_import():
    """A YAML with no aws_secret(...) refs should not trigger boto3 usage."""
    content = "name: project\ndatabase: localhost"
    with patch("boto3.client") as mock_client:
        result = NaoConfig._process_aws_secrets(content)
    assert result == content
    mock_client.assert_not_called()


def test_resolves_single_aws_secret_reference():
    """A `{{ aws_secret(...) }}` placeholder is replaced with the secret value."""
    payload = json.dumps({"AZURE_AD_CLIENT_ID": "client-id-123"})
    content = 'client_id: \'{{ aws_secret("prod/sso", "AZURE_AD_CLIENT_ID") }}\''

    with patch("boto3.client", return_value=_mock_boto3_client({"prod/sso": payload})):
        result = NaoConfig._process_aws_secrets(content)

    assert result == "client_id: 'client-id-123'"


def test_resolves_dollar_prefixed_aws_secret_reference():
    """The `${{ aws_secret(...) }}` form (matching the env() prefix) also works."""
    payload = json.dumps({"DB_PASSWORD": "p@ss"})
    content = "password: ${{ aws_secret('prod/db', 'DB_PASSWORD') }}"

    with patch("boto3.client", return_value=_mock_boto3_client({"prod/db": payload})):
        result = NaoConfig._process_aws_secrets(content)

    assert result == "password: p@ss"


def test_caches_secret_across_multiple_keys_from_same_id():
    """Repeated references to the same secret id only call AWS once."""
    payload = json.dumps({"CLIENT_ID": "id", "CLIENT_SECRET": "shh"})
    content = (
        'client_id: \'{{ aws_secret("prod/sso", "CLIENT_ID") }}\'\n'
        'client_secret: \'{{ aws_secret("prod/sso", "CLIENT_SECRET") }}\''
    )
    fake_client = _mock_boto3_client({"prod/sso": payload})

    with patch("boto3.client", return_value=fake_client):
        result = NaoConfig._process_aws_secrets(content)

    assert "id" in result and "shh" in result
    assert fake_client.get_secret_value.call_count == 1


def test_resolves_references_to_different_secret_ids():
    """References to distinct secret ids each fetch their own secret."""
    sso_payload = json.dumps({"AZURE_AD_CLIENT_ID": "azure-id"})
    db_payload = json.dumps({"DB_PASSWORD": "p@ss"})
    content = (
        'azure: \'{{ aws_secret("prod/sso", "AZURE_AD_CLIENT_ID") }}\'\n'
        'db: \'{{ aws_secret("prod/db", "DB_PASSWORD") }}\''
    )

    with patch(
        "boto3.client",
        return_value=_mock_boto3_client({"prod/sso": sso_payload, "prod/db": db_payload}),
    ):
        result = NaoConfig._process_aws_secrets(content)

    assert "azure-id" in result
    assert "p@ss" in result


def test_raises_on_missing_secret_id():
    content = 'client_id: \'{{ aws_secret("prod/missing", "X") }}\''
    with patch("boto3.client", return_value=_mock_boto3_client({})):
        with pytest.raises(NaoConfigError, match="Failed to fetch AWS secret 'prod/missing'"):
            NaoConfig._process_aws_secrets(content)


def test_raises_on_missing_key_inside_secret():
    payload = json.dumps({"OTHER_KEY": "value"})
    content = 'client_id: \'{{ aws_secret("prod/sso", "AZURE_AD_CLIENT_ID") }}\''

    with patch("boto3.client", return_value=_mock_boto3_client({"prod/sso": payload})):
        with pytest.raises(NaoConfigError, match="has no key 'AZURE_AD_CLIENT_ID'"):
            NaoConfig._process_aws_secrets(content)


def test_raises_on_invalid_json_secret_value():
    content = 'client_id: \'{{ aws_secret("prod/sso", "X") }}\''
    with patch("boto3.client", return_value=_mock_boto3_client({"prod/sso": "not-json"})):
        with pytest.raises(NaoConfigError, match="is not valid JSON"):
            NaoConfig._process_aws_secrets(content)


def test_raises_when_secret_value_is_not_an_object():
    content = 'client_id: \'{{ aws_secret("prod/sso", "X") }}\''
    with patch("boto3.client", return_value=_mock_boto3_client({"prod/sso": '"plain-string"'})):
        with pytest.raises(NaoConfigError, match="must be a JSON object"):
            NaoConfig._process_aws_secrets(content)


def test_coerces_non_string_values_to_json_strings():
    """Non-string values (numbers, lists) are JSON-encoded so YAML still loads cleanly."""
    payload = json.dumps({"PORT": 5432, "ENABLED": True, "TAGS": ["a", "b"]})
    content = 'port: \'{{ aws_secret("prod/db", "PORT") }}\''

    with patch("boto3.client", return_value=_mock_boto3_client({"prod/db": payload})):
        result = NaoConfig._process_aws_secrets(content)

    assert result == "port: '5432'"
