output "container_app_fqdn" {
  value = azurerm_container_app.api.ingress[0].fqdn
}

output "container_app_name" {
  value = azurerm_container_app.api.name
}

output "resource_group_name" {
  value = azurerm_resource_group.rg.name
}
