package com.backend.core.config

import org.hibernate.cfg.MultiTenancySettings
import org.hibernate.context.spi.CurrentTenantIdentifierResolver
import org.hibernate.engine.jdbc.connections.spi.MultiTenantConnectionProvider
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import javax.sql.DataSource

@Configuration
class MultiTenantConfiguration {

    @Bean
    fun currentTenantIdentifierResolver(): CurrentTenantIdentifierResolver {
        return object : CurrentTenantIdentifierResolver {
            override fun resolveCurrentTenantIdentifier(): String {
                return TenantContext.getTenantId() ?: "default"
            }

            override fun validateExistingCurrentSessions(): Boolean {
                return false
            }
        }
    }

    @Bean
    fun multiTenantConnectionProvider(dataSource: DataSource): MultiTenantConnectionProvider {
        return MultiTenantConnectionProviderImpl(dataSource)
    }

    @Bean
    fun hibernatePropertiesCustomizer(
        multiTenantConnectionProvider: MultiTenantConnectionProvider,
        currentTenantIdentifierResolver: CurrentTenantIdentifierResolver
    ): HibernatePropertiesCustomizer {
        return HibernatePropertiesCustomizer { properties ->
            properties[MultiTenancySettings.MULTI_TENANT_CONNECTION_PROVIDER] = multiTenantConnectionProvider
            properties[MultiTenancySettings.MULTI_TENANT_IDENTIFIER_RESOLVER] = currentTenantIdentifierResolver
            properties[MultiTenancySettings.MULTI_TENANT] = "DISCRIMINATOR"
        }
    }
}
