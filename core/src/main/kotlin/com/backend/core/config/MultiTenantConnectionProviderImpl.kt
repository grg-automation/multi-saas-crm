package com.backend.core.config

import org.hibernate.engine.jdbc.connections.spi.MultiTenantConnectionProvider
import org.hibernate.service.UnknownUnwrapTypeException
import java.sql.Connection
import java.sql.SQLException
import javax.sql.DataSource

class MultiTenantConnectionProviderImpl(private val dataSource: DataSource) : MultiTenantConnectionProvider {
    override fun getAnyConnection(): Connection {
        return dataSource.connection
    }

    override fun getConnection(tenantIdentifier: String?): Connection {
        val connection = getAnyConnection()
        // For discriminator-based tenancy, we rely on application-level filtering
        // If schema-based, uncomment and adjust the schema name logic
        // connection.schema = "tenant_$tenantIdentifier"
        return connection
    }

    override fun releaseAnyConnection(connection: Connection?) {
        connection?.close()
    }

    override fun releaseConnection(tenantIdentifier: String?, connection: Connection?) {
        releaseAnyConnection(connection)
    }

    override fun supportsAggressiveRelease(): Boolean {
        return false
    }

    override fun isUnwrappableAs(unwrapType: Class<*>?): Boolean {
        return false
    }

    override fun <T : Any?> unwrap(unwrapType: Class<T>?): T {
        throw UnknownUnwrapTypeException(unwrapType)
    }
}