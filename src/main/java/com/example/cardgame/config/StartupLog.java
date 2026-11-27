package com.example.cardgame.config;

import javax.sql.DataSource;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import com.example.cardgame.repository.UserRepository;

/** 起動時に、どのデータベースにつながったかと登録会員数をログに出す（Render の Logs で確認用） */
@Component
public class StartupLog implements CommandLineRunner {

    private final DataSource dataSource;
    private final UserRepository userRepository;

    public StartupLog(DataSource dataSource, UserRepository userRepository) {
        this.dataSource = dataSource;
        this.userRepository = userRepository;
    }

    @Override
    public void run(String... args) {
        String url;
        try (var conn = dataSource.getConnection()) {
            url = conn.getMetaData().getURL();
        } catch (Exception e) {
            url = "取得できませんでした（" + e.getMessage() + "）";
        }
        // パスワードなどが URL に入っていてもログに出さない
        url = url.replaceAll("(?i)(password=)[^&;]*", "$1****");
        System.out.println("データベース: " + url + " / 登録会員数: " + userRepository.count());
        if (url.startsWith("jdbc:h2")) {
            System.out.println("※ H2（サーバー内）のため、再起動・スリープでデータが消えます。SPRING_DATASOURCE_URL などを設定すると PostgreSQL（Neon など）を使います。");
        }
    }
}
