output "container_app_fqdn" {
  value = azurerm_container_app.api.ingress[0].fqdn
}