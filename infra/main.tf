locals {
  prefix = "remez-${var.environment}"
}

resource "azurerm_resource_group" "rg" {
  name     = "${local.prefix}-rg"
  location = var.location
}

resource "azurerm_log_analytics_workspace" "law" {
  name                = "${local.prefix}-law"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  sku               = "PerGB2018"
  retention_in_days = 7
}

resource "azurerm_container_app_environment" "cae" {
  name                = "${local.prefix}-cae"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  log_analytics_workspace_id = azurerm_log_analytics_workspace.law.id
}

resource "azurerm_container_app" "api" {
  name                         = "${local.prefix}-api"
  container_app_environment_id = azurerm_container_app_environment.cae.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  ingress {
    external_enabled = true
    target_port      = var.container_port
    transport        = "auto"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  secret {
    name  = "ghcr-pat"
    value = var.ghcr_pat
  }

  registry {
    server               = "ghcr.io"
    username             = var.ghcr_username
    password_secret_name = "ghcr-pat"
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "api"
      image  = var.image
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "AZURE_AI_ENDPOINT"
        value = var.azure_ai_endpoint
      }
      env {
        name  = "AZURE_AI_API_KEY"
        value = var.azure_ai_api_key
      }
      env {
        name  = "AZURE_AI_MODEL"
        value = "gpt-5-mini"
      }
      env {
        name  = "PORT"
        value = tostring(var.container_port)
      }
    }
  }
}
